import logging
from collections.abc import Iterator
from datetime import timedelta
from http import HTTPStatus
from inspect import unwrap
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy import Engine, event
from sqlalchemy.orm import Session, scoped_session, sessionmaker
from werkzeug.datastructures import FileStorage
from werkzeug.exceptions import NotFound

import services
from controllers.common.errors import (
    FilenameNotExistsError,
    FileTooLargeError,
    NoFileUploadedError,
    TooManyFilesError,
    UnsupportedFileTypeError,
)
from controllers.console import console_ns
from controllers.console.error import AccountNotLinkTenantError, NotAllowedCreateWorkspace, WorkspacesLimitExceeded
from controllers.console.workspace.error import (
    CannotArchiveLastWorkspaceError,
    CurrentWorkspaceArchivedError,
    OwnerAccountNotFoundError,
    OwnerCannotLeaveError,
    WorkspaceNotFoundError,
    WorkspaceNotOwnerError,
)
from controllers.console.workspace.workspace import (
    AdminUnarchiveWorkspaceApi,
    AdminWorkspaceInfoApi,
    ArchivedWorkspaceListApi,
    ArchiveWorkspaceApi,
    CurrentWorkspaceSummaryApi,
    CustomConfigWorkspaceApi,
    LeaveWorkspaceApi,
    SwitchWorkspaceApi,
    TenantInfoResponse,
    TenantListApi,
    UnarchiveWorkspaceApi,
    WebappLogoWorkspaceApi,
    WorkspaceInfoApi,
    WorkspaceListApi,
    WorkspaceLogoUploadResponse,
    WorkspacePermissionApi,
    WorkspacePermissionResponse,
    WorkspacePolicyApi,
)
from enums import CloudPlan, DeploymentEdition
from libs.datetime_utils import naive_utc_now
from machinery.context import RequestContext
from models.account import Account, Tenant, TenantAccountJoin, TenantAccountRole, TenantCustomConfigDict, TenantStatus
from repositories.workspace_query_repository import WorkspaceQueryRepository
from services import workspace_plan_gateway
from services.errors.workspace import (
    CannotArchiveLastWorkspaceError as CannotArchiveLastWorkspaceServiceError,
)
from services.errors.workspace import (
    OwnerCannotLeaveError as OwnerCannotLeaveServiceError,
)
from services.errors.workspace import WorkSpaceNotAllowedCreateError, WorkspacesLimitExceededError
from services.workspace_query_service import WorkspaceQueryService, WorkspaceRecord


@pytest.fixture
def workspace_session(sqlite_engine: Engine) -> Iterator[scoped_session[Session]]:
    """Provide the callable scoped session expected by Flask-SQLAlchemy controllers."""
    Tenant.metadata.create_all(sqlite_engine, tables=[Tenant.__table__, TenantAccountJoin.__table__])
    session = scoped_session(sessionmaker(bind=sqlite_engine, expire_on_commit=False))
    try:
        yield session
    finally:
        session.remove()


@pytest.fixture
def workspace_plan_dependencies(monkeypatch: pytest.MonkeyPatch) -> tuple[MagicMock, MagicMock]:
    get_plan_bulk = MagicMock()
    get_features = MagicMock()
    monkeypatch.setattr(workspace_plan_gateway.BillingService, "get_plan_bulk", get_plan_bulk)
    monkeypatch.setattr(workspace_plan_gateway.FeatureService, "get_features", get_features)
    return get_plan_bulk, get_features


def configure_workspace_plans(
    monkeypatch: pytest.MonkeyPatch,
    *,
    edition: DeploymentEdition = DeploymentEdition.CLOUD,
) -> None:
    monkeypatch.setattr(
        workspace_plan_gateway,
        "dify_config",
        SimpleNamespace(
            DEPLOYMENT_EDITION=edition,
        ),
    )


def features_with_plan(plan: str) -> SimpleNamespace:
    return SimpleNamespace(billing=SimpleNamespace(subscription=SimpleNamespace(plan=plan)))


def make_account(account_id: str = "u1") -> Account:
    account = Account(name="Test User", email=f"{account_id}@example.com")
    account.id = account_id
    return account


def make_tenant(
    tenant_id: str = "t1",
    *,
    name: str | None = None,
    status: TenantStatus = TenantStatus.NORMAL,
    custom_config: TenantCustomConfigDict | None = None,
) -> Tenant:
    tenant = Tenant(name=name or f"Tenant {tenant_id}", status=status)
    tenant.id = tenant_id
    tenant.created_at = naive_utc_now()
    if custom_config is not None:
        tenant.custom_config_dict = custom_config
    return tenant


def make_account_with_tenant(tenant: Tenant) -> Account:
    account = make_account()
    account._current_tenant = tenant
    return account


class TestTenantListApi:
    def test_get_passes_context_and_serializes_workspaces(self):
        api = TenantListApi()
        method = unwrap(api.get)
        request_context = RequestContext(
            request_id="request-1",
            trace_id="trace-1",
            account_id="account-1",
            active_workspace_id="workspace-1",
        )
        created_at = naive_utc_now()
        last_opened_at = naive_utc_now()
        workspaces = MagicMock()
        workspaces.list_for_account.return_value = (
            WorkspaceRecord(
                id="workspace-1",
                name="Workspace 1",
                status=TenantStatus.NORMAL.value,
                created_at=created_at,
                last_opened_at=last_opened_at,
            ),
            WorkspaceRecord(
                id="workspace-2",
                name=None,
                status=TenantStatus.NORMAL.value,
                created_at=created_at,
                last_opened_at=None,
            ),
        )
        plans = MagicMock()
        plans.resolve_many.return_value = {"workspace-1": CloudPlan.TEAM}
        workspace_queries = WorkspaceQueryService(workspaces=workspaces, plans=plans)
        application_services_mock = SimpleNamespace(workspace_queries=workspace_queries)

        session = MagicMock()
        session.get.return_value = None
        with patch(
            "controllers.console.workspace.workspace.application_services", return_value=application_services_mock
        ):
            result, status = method(api, session, request_context)

        assert status == HTTPStatus.OK
        assert result == {
            "workspaces": [
                {
                    "id": "workspace-1",
                    "name": "Workspace 1",
                    "plan": "team",
                    "status": "normal",
                    "created_at": int(created_at.timestamp()),
                    "last_opened_at": int(last_opened_at.timestamp()),
                    "current": True,
                    "role": None,
                    "is_owner": False,
                },
                {
                    "id": "workspace-2",
                    "name": None,
                    "plan": "sandbox",
                    "status": "normal",
                    "created_at": int(created_at.timestamp()),
                    "last_opened_at": None,
                    "current": False,
                    "role": None,
                    "is_owner": False,
                },
            ]
        }
        workspaces.list_for_account.assert_called_once_with("account-1")
        plans.resolve_many.assert_called_once_with(["workspace-1", "workspace-2"])

    def test_post_creates_and_switches(self, app: Flask):
        api = TenantListApi()
        method = unwrap(api.post)
        user = make_account()
        tenant = make_tenant("new-workspace", name="Team Space")
        session = MagicMock()
        lock = MagicMock()
        lock.__enter__ = MagicMock(return_value=lock)
        lock.__exit__ = MagicMock(return_value=False)

        with (
            app.test_request_context("/workspaces", json={"name": "  Team Space  "}),
            patch("controllers.console.workspace.workspace.redis_client.lock", return_value=lock),
            patch(
                "controllers.console.workspace.workspace.TenantService.create_owner_tenant",
                return_value=tenant,
            ) as create_owner_tenant,
            patch("controllers.console.workspace.workspace.TenantService.switch_tenant") as switch_tenant,
            patch(
                "controllers.console.workspace.workspace.WorkspaceService.get_tenant_info",
                return_value={"id": tenant.id, "name": tenant.name},
            ),
        ):
            result, status = method(api, session, user)

        assert status == HTTPStatus.CREATED
        assert result["result"] == "success"
        assert result["new_tenant"]["id"] == tenant.id
        create_owner_tenant.assert_called_once_with(user, name="Team Space", session=session)
        switch_tenant.assert_called_once_with(user, tenant.id, session=session)

    def test_post_not_allowed(self, app: Flask):
        api = TenantListApi()
        method = unwrap(api.post)
        lock = MagicMock()
        lock.__enter__ = MagicMock(return_value=lock)
        lock.__exit__ = MagicMock(return_value=False)

        with (
            app.test_request_context("/workspaces", json={"name": "Denied"}),
            patch("controllers.console.workspace.workspace.redis_client.lock", return_value=lock),
            patch(
                "controllers.console.workspace.workspace.TenantService.create_owner_tenant",
                side_effect=WorkSpaceNotAllowedCreateError(),
            ),
        ):
            with pytest.raises(NotAllowedCreateWorkspace):
                method(api, MagicMock(), make_account())

    def test_post_limit_exceeded(self, app: Flask):
        api = TenantListApi()
        method = unwrap(api.post)
        lock = MagicMock()
        lock.__enter__ = MagicMock(return_value=lock)
        lock.__exit__ = MagicMock(return_value=False)

        with (
            app.test_request_context("/workspaces", json={"name": "Overflow"}),
            patch("controllers.console.workspace.workspace.redis_client.lock", return_value=lock),
            patch(
                "controllers.console.workspace.workspace.TenantService.create_owner_tenant",
                side_effect=WorkspacesLimitExceededError(),
            ),
        ):
            with pytest.raises(WorkspacesLimitExceeded):
                method(api, MagicMock(), make_account())


class TestWorkspacePolicyApi:
    def test_get_returns_policy(self, app: Flask):
        api = WorkspacePolicyApi()
        method = unwrap(api.get)
        quota = SimpleNamespace(enabled=True, size=2, limit=5)

        with (
            app.test_request_context("/workspaces/policy"),
            patch(
                "controllers.console.workspace.workspace.FeatureService.get_workspace_creation_policy",
                return_value=(True, quota),
            ) as get_policy,
        ):
            result, status = method(api)

        assert status == HTTPStatus.OK
        assert result == {
            "is_allow_create_workspace": True,
            "workspaces": {"enabled": True, "size": 2, "limit": 5},
        }
        get_policy.assert_called_once_with()


class TestWorkspaceQueryRepository:
    def test_list_for_account_filters_orders_and_maps(self, workspace_session: scoped_session[Session]):
        now = naive_utc_now()
        earlier = make_tenant("workspace-1")
        earlier.created_at = now - timedelta(days=1)
        later = make_tenant("workspace-2")
        later.created_at = now
        archived = make_tenant("workspace-3", status=TenantStatus.ARCHIVE)
        other_account = make_tenant("workspace-4")
        last_opened_at = now - timedelta(hours=1)
        workspace_session.add_all(
            [
                earlier,
                later,
                archived,
                other_account,
                TenantAccountJoin(
                    tenant_id=earlier.id,
                    account_id="account-1",
                    last_opened_at=last_opened_at,
                ),
                TenantAccountJoin(tenant_id=later.id, account_id="account-1"),
                TenantAccountJoin(tenant_id=archived.id, account_id="account-1"),
                TenantAccountJoin(tenant_id=other_account.id, account_id="account-2"),
            ]
        )
        workspace_session.commit()

        repository = WorkspaceQueryRepository(workspace_session.session_factory)
        result = repository.list_for_account("account-1")

        assert result == (
            WorkspaceRecord(
                id=earlier.id,
                name=earlier.name,
                status=TenantStatus.NORMAL.value,
                created_at=earlier.created_at,
                last_opened_at=last_opened_at,
                role=TenantAccountRole.NORMAL.value,
            ),
            WorkspaceRecord(
                id=later.id,
                name=later.name,
                status=TenantStatus.NORMAL.value,
                created_at=later.created_at,
                last_opened_at=None,
                role=TenantAccountRole.NORMAL.value,
            ),
        )
        assert repository.list_archived_for_account("account-1") == (
            WorkspaceRecord(
                id=archived.id,
                name=archived.name,
                status=TenantStatus.ARCHIVE.value,
                created_at=archived.created_at,
                last_opened_at=None,
                role=TenantAccountRole.NORMAL.value,
            ),
        )


class TestDeploymentWorkspacePlanGateway:
    def test_saas_uses_bulk_plans_and_feature_fallback(
        self,
        monkeypatch: pytest.MonkeyPatch,
        workspace_plan_dependencies: tuple[MagicMock, MagicMock],
    ) -> None:
        configure_workspace_plans(monkeypatch)
        get_plan_bulk, get_features = workspace_plan_dependencies
        get_plan_bulk.return_value = {"workspace-1": {"plan": CloudPlan.TEAM, "expiration_date": 0}}
        get_features.return_value = features_with_plan(CloudPlan.PROFESSIONAL)

        result = workspace_plan_gateway.DeploymentWorkspacePlanGateway().resolve_many(["workspace-1", "workspace-2"])

        assert result == {"workspace-1": CloudPlan.TEAM, "workspace-2": CloudPlan.PROFESSIONAL}
        get_plan_bulk.assert_called_once()
        assert list(get_plan_bulk.call_args.args[0]) == ["workspace-1", "workspace-2"]
        get_features.assert_called_once_with("workspace-2", exclude_vector_space=True)

    def test_saas_empty_bulk_result_falls_back_to_features(
        self,
        monkeypatch: pytest.MonkeyPatch,
        workspace_plan_dependencies: tuple[MagicMock, MagicMock],
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        configure_workspace_plans(monkeypatch)
        get_plan_bulk, get_features = workspace_plan_dependencies
        get_plan_bulk.return_value = {}
        get_features.return_value = features_with_plan(CloudPlan.TEAM)

        with caplog.at_level(logging.WARNING, logger=workspace_plan_gateway.__name__):
            result = workspace_plan_gateway.DeploymentWorkspacePlanGateway().resolve_many(
                ["workspace-1", "workspace-2"]
            )

        assert result == {"workspace-1": CloudPlan.TEAM, "workspace-2": CloudPlan.TEAM}
        assert "get_plan_bulk returned empty result, falling back to FeatureService" in caplog.messages

    def test_non_saas_uses_features(
        self,
        monkeypatch: pytest.MonkeyPatch,
        workspace_plan_dependencies: tuple[MagicMock, MagicMock],
    ) -> None:
        configure_workspace_plans(
            monkeypatch,
            edition=DeploymentEdition.COMMUNITY,
        )
        get_plan_bulk, get_features = workspace_plan_dependencies
        get_features.return_value = features_with_plan(CloudPlan.SANDBOX)

        result = workspace_plan_gateway.DeploymentWorkspacePlanGateway().resolve_many(["workspace-1"])

        assert result == {"workspace-1": CloudPlan.SANDBOX}
        get_plan_bulk.assert_not_called()
        get_features.assert_called_once_with("workspace-1", exclude_vector_space=True)

    def test_enterprise_only_skips_external_lookups(
        self,
        monkeypatch: pytest.MonkeyPatch,
        workspace_plan_dependencies: tuple[MagicMock, MagicMock],
    ) -> None:
        configure_workspace_plans(
            monkeypatch,
            edition=DeploymentEdition.ENTERPRISE,
        )
        get_plan_bulk, get_features = workspace_plan_dependencies

        result = workspace_plan_gateway.DeploymentWorkspacePlanGateway().resolve_many(["workspace-1", "workspace-2"])

        assert result == {"workspace-1": CloudPlan.SANDBOX, "workspace-2": CloudPlan.SANDBOX}
        get_plan_bulk.assert_not_called()
        get_features.assert_not_called()


def seed_operator_workspaces(workspace_session: scoped_session[Session]) -> dict[str, Tenant]:
    now = naive_utc_now()
    alpha = make_tenant("alpha", name="Alpha Team")
    alpha.created_at = now
    beta = make_tenant("beta", name="Beta Lab", status=TenantStatus.ARCHIVE)
    beta.created_at = now - timedelta(hours=1)
    alpha_archive = make_tenant("alpha-archive", name="Alpha Archive", status=TenantStatus.ARCHIVE)
    alpha_archive.created_at = now - timedelta(hours=2)
    workspace_session.add_all(
        [
            alpha,
            beta,
            alpha_archive,
            TenantAccountJoin(tenant_id=alpha.id, account_id="u1"),
            TenantAccountJoin(tenant_id=alpha.id, account_id="u2"),
            TenantAccountJoin(tenant_id=beta.id, account_id="u1"),
        ]
    )
    workspace_session.commit()
    return {"alpha": alpha, "beta": beta, "alpha_archive": alpha_archive}


class TestWorkspaceListApi:
    def test_get_includes_member_count_and_newest_first(self, app: Flask, workspace_session: scoped_session[Session]):
        tenants = seed_operator_workspaces(workspace_session)
        api = WorkspaceListApi()
        method = unwrap(api.get)

        with app.test_request_context("/all-workspaces", query_string={"page": 1, "limit": 20}):
            result, status = method(api, workspace_session)

        assert status == HTTPStatus.OK
        assert result["total"] == 3
        assert result["has_more"] is False
        assert [item["id"] for item in result["data"]] == ["alpha", "beta", "alpha-archive"]
        assert result["data"][0]["member_count"] == 2
        assert result["data"][0]["name"] == tenants["alpha"].name
        assert result["data"][1]["member_count"] == 1
        assert result["data"][2]["member_count"] == 0

    def test_get_filters_by_keyword_and_status(self, app: Flask, workspace_session: scoped_session[Session]):
        seed_operator_workspaces(workspace_session)
        api = WorkspaceListApi()
        method = unwrap(api.get)

        with app.test_request_context(
            "/all-workspaces",
            query_string={"keyword": "alpha", "status": TenantStatus.ARCHIVE.value, "page": 1, "limit": 20},
        ):
            result, status = method(api, workspace_session)

        assert status == HTTPStatus.OK
        assert result["total"] == 1
        assert result["data"][0]["id"] == "alpha-archive"
        assert result["data"][0]["status"] == TenantStatus.ARCHIVE.value

    def test_get_has_next_true(self, app: Flask, workspace_session: scoped_session[Session]):
        seed_operator_workspaces(workspace_session)
        api = WorkspaceListApi()
        method = unwrap(api.get)

        with app.test_request_context("/all-workspaces", query_string={"page": 1, "limit": 1}):
            result, status = method(api, workspace_session)

        assert status == HTTPStatus.OK
        assert result["has_more"] is True
        assert result["total"] == 3
        assert len(result["data"]) == 1

    def test_post_creates_for_owner(self, app: Flask):
        api = WorkspaceListApi()
        method = unwrap(api.post)
        owner = make_account("owner-1")
        tenant = make_tenant("new-workspace", name="Ops Space")
        session = MagicMock()
        lock = MagicMock()
        lock.__enter__ = MagicMock(return_value=lock)
        lock.__exit__ = MagicMock(return_value=False)

        with (
            app.test_request_context(
                "/all-workspaces",
                json={"name": "  Ops Space  ", "owner_email": "owner-1@example.com"},
            ),
            patch("controllers.console.workspace.workspace.redis_client.lock", return_value=lock),
            patch(
                "controllers.console.workspace.workspace.AccountService.get_account_by_email_with_case_fallback",
                return_value=owner,
            ) as get_owner,
            patch(
                "controllers.console.workspace.workspace.TenantService.create_owner_tenant",
                return_value=tenant,
            ) as create_owner_tenant,
        ):
            result, status = method(api, session)

        assert status == HTTPStatus.CREATED
        assert result["result"] == "success"
        assert result["tenant"]["id"] == tenant.id
        assert result["tenant"]["name"] == "Ops Space"
        get_owner.assert_called_once_with("owner-1@example.com", session=session)
        create_owner_tenant.assert_called_once_with(
            owner,
            name="Ops Space",
            is_from_dashboard=True,
            session=session,
        )

    def test_post_owner_missing_is_404(self, app: Flask):
        api = WorkspaceListApi()
        method = unwrap(api.post)
        with (
            app.test_request_context(
                "/all-workspaces",
                json={"name": "Ops Space", "owner_email": "missing@example.com"},
            ),
            patch(
                "controllers.console.workspace.workspace.AccountService.get_account_by_email_with_case_fallback",
                return_value=None,
            ),
        ):
            with pytest.raises(OwnerAccountNotFoundError) as exc_info:
                method(api, MagicMock())

        assert exc_info.value.code == HTTPStatus.NOT_FOUND
        assert exc_info.value.error_code == "owner_account_not_found"

    def test_post_limit_exceeded(self, app: Flask):
        api = WorkspaceListApi()
        method = unwrap(api.post)
        lock = MagicMock()
        lock.__enter__ = MagicMock(return_value=lock)
        lock.__exit__ = MagicMock(return_value=False)

        with (
            app.test_request_context(
                "/all-workspaces",
                json={"name": "Overflow", "owner_email": "owner-1@example.com"},
            ),
            patch("controllers.console.workspace.workspace.redis_client.lock", return_value=lock),
            patch(
                "controllers.console.workspace.workspace.AccountService.get_account_by_email_with_case_fallback",
                return_value=make_account("owner-1"),
            ),
            patch(
                "controllers.console.workspace.workspace.TenantService.create_owner_tenant",
                side_effect=WorkspacesLimitExceededError(),
            ),
        ):
            with pytest.raises(WorkspacesLimitExceeded):
                method(api, MagicMock())


def test_legacy_current_workspace_routes_are_not_registered():
    urls = {url for _resource, resource_urls, _route_doc, _kwargs in console_ns.resources for url in resource_urls}

    assert "/workspaces/current" not in urls
    assert "/info" not in urls
    assert "/all-workspaces/<uuid:workspace_id>/info" in urls


class TestCurrentWorkspaceSummaryApi:
    def test_get_summary(self, app: Flask):
        api = CurrentWorkspaceSummaryApi()
        method = unwrap(api.get)
        tenant = make_tenant()
        user = make_account_with_tenant(tenant)
        session = MagicMock()
        summary = {
            "id": tenant.id,
            "name": tenant.name,
            "role": "owner",
            "plan": CloudPlan.SANDBOX,
            "credits": 180,
            "is_owner": True,
        }

        with (
            app.test_request_context("/workspaces/current/summary"),
            patch(
                "controllers.console.workspace.workspace.WorkspaceService.get_current_workspace_summary",
                return_value=summary,
            ) as get_summary,
        ):
            result, status = method(api, session, user)

        assert status == HTTPStatus.OK
        assert result == {
            "id": tenant.id,
            "name": tenant.name,
            "role": "owner",
            "plan": "sandbox",
            "credits": 180,
            "is_owner": True,
        }
        get_summary.assert_called_once_with(tenant, user.id, session=session)

    def test_get_archived_tenant_returns_conflict(self, app: Flask):
        api = CurrentWorkspaceSummaryApi()
        method = unwrap(api.get)
        tenant = make_tenant(status=TenantStatus.ARCHIVE)
        user = make_account_with_tenant(tenant)

        with app.test_request_context("/workspaces/current/summary"):
            with pytest.raises(CurrentWorkspaceArchivedError) as exc_info:
                method(api, MagicMock(), user)

        assert exc_info.value.code == HTTPStatus.CONFLICT
        assert exc_info.value.error_code == "current_workspace_archived"


class TestTenantInfoResponse:
    def test_tenant_info_response_normalizes_enum_and_datetime(self):
        created_at = naive_utc_now()
        payload = TenantInfoResponse.model_validate(
            {"id": "t1", "status": TenantStatus.NORMAL, "plan": CloudPlan.TEAM, "created_at": created_at}
        ).model_dump(mode="json")
        assert payload["status"] == "normal"
        assert payload["plan"] == "team"
        assert payload["created_at"] == int(created_at.timestamp())

    def test_tenant_info_response_has_typed_custom_config(self):
        payload = TenantInfoResponse.model_validate(
            {
                "id": "t1",
                "custom_config": {
                    "remove_webapp_brand": True,
                    "replace_webapp_logo": "logo-file-id",
                    "ignored": "value",
                },
            }
        ).model_dump(mode="json")
        assert payload["custom_config"] == {"remove_webapp_brand": True, "replace_webapp_logo": "logo-file-id"}


class TestSwitchWorkspaceApi:
    def test_switch_success(self, app: Flask, workspace_session: scoped_session[Session]):
        api = SwitchWorkspaceApi()
        method = unwrap(api.post)
        payload = {"tenant_id": "t2"}
        tenant = make_tenant("t2")
        workspace_session.add(tenant)
        workspace_session.commit()
        user = make_account()
        with (
            app.test_request_context("/workspaces/switch", json=payload),
            patch("controllers.console.workspace.workspace.TenantService.switch_tenant") as switch_tenant,
            patch(
                "controllers.console.workspace.workspace.WorkspaceService.get_tenant_info", return_value={"id": "t2"}
            ),
        ):
            result = method(api, workspace_session, user)

        assert result["result"] == "success"
        switch_tenant.assert_called_once_with(user, "t2", session=workspace_session)

    def test_switch_not_linked(self, app: Flask):
        api = SwitchWorkspaceApi()
        method = unwrap(api.post)
        payload = {"tenant_id": "bad"}
        user = make_account()
        with (
            app.test_request_context("/workspaces/switch", json=payload),
            patch("controllers.console.workspace.workspace.TenantService.switch_tenant", side_effect=Exception),
        ):
            with pytest.raises(AccountNotLinkTenantError):
                method(api, MagicMock(), user)

    def test_switch_tenant_not_found(self, app: Flask, workspace_session: scoped_session[Session]):
        api = SwitchWorkspaceApi()
        method = unwrap(api.post)
        payload = {"tenant_id": "missing"}
        user = make_account()
        with (
            app.test_request_context("/workspaces/switch", json=payload),
            patch("controllers.console.workspace.workspace.TenantService.switch_tenant"),
        ):
            with pytest.raises(ValueError):
                method(api, workspace_session, user)


class TestCustomConfigWorkspaceApi:
    def test_get_workspace_not_found(self, app: Flask, workspace_session: scoped_session[Session]):
        api = CustomConfigWorkspaceApi()
        method = unwrap(api.get)

        with app.test_request_context("/workspaces/custom-config"), pytest.raises(NotFound):
            method(api, workspace_session, "missing")

    def test_get_defaults(self, app: Flask, workspace_session: scoped_session[Session]):
        api = CustomConfigWorkspaceApi()
        method = unwrap(api.get)
        tenant = make_tenant(custom_config={})
        workspace_session.add(tenant)
        workspace_session.commit()

        with app.test_request_context("/workspaces/custom-config"):
            result = method(api, workspace_session, tenant.id)

        assert result == {"remove_webapp_brand": False, "replace_webapp_logo": None}

    def test_get_configured_brand(self, app: Flask, workspace_session: scoped_session[Session]):
        api = CustomConfigWorkspaceApi()
        method = unwrap(api.get)
        tenant = make_tenant(custom_config={"remove_webapp_brand": True, "replace_webapp_logo": "logo-file-id"})
        workspace_session.add(tenant)
        workspace_session.commit()

        with (
            app.test_request_context("/workspaces/custom-config"),
            patch("controllers.console.workspace.workspace.dify_config.FILES_URL", "https://files.example.com"),
        ):
            result = method(api, workspace_session, tenant.id)

        assert result == {
            "remove_webapp_brand": True,
            "replace_webapp_logo": f"https://files.example.com/files/workspaces/{tenant.id}/webapp-logo",
        }

    def test_post_success(self, app: Flask, workspace_session: scoped_session[Session]):
        api = CustomConfigWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant(custom_config={})
        workspace_session.add(tenant)
        workspace_session.commit()

        payload = {"remove_webapp_brand": True}
        events = []
        event.listen(workspace_session, "after_commit", lambda _: events.append("commit"))
        with (
            app.test_request_context("/workspaces/custom-config", json=payload),
            patch(
                "controllers.console.workspace.workspace.WorkspaceService.get_tenant_info",
                side_effect=lambda *args, **kwargs: events.append("get_tenant_info") or {"id": "t1"},
            ),
        ):
            result = method(api, workspace_session, "t1")
        assert result["result"] == "success"
        assert events == ["commit", "get_tenant_info"]

    def test_logo_fallback(self, app: Flask, workspace_session: scoped_session[Session]):
        api = CustomConfigWorkspaceApi()
        method = unwrap(api.post)

        tenant = make_tenant(custom_config={"replace_webapp_logo": "old-logo"})
        workspace_session.add(tenant)
        workspace_session.commit()

        payload = {"remove_webapp_brand": False}

        with (
            app.test_request_context("/workspaces/custom-config", json=payload),
            patch(
                "controllers.console.workspace.workspace.WorkspaceService.get_tenant_info",
                return_value={"id": "t1"},
            ),
        ):
            result = method(api, workspace_session, "t1")

        assert tenant.custom_config_dict["replace_webapp_logo"] == "old-logo"
        assert result["result"] == "success"


class TestWebappLogoWorkspaceApi:
    def test_no_file(self, app: Flask):
        api = WebappLogoWorkspaceApi()
        method = unwrap(api.post)
        user = make_account()
        with app.test_request_context("/upload", data={}):
            with pytest.raises(NoFileUploadedError):
                method(api, user)

    def test_too_many_files(self, app: Flask):
        api = WebappLogoWorkspaceApi()
        method = unwrap(api.post)
        data = {"file": MagicMock(), "extra": MagicMock()}
        user = make_account()
        with app.test_request_context("/upload", data=data):
            with pytest.raises(TooManyFilesError):
                method(api, user)

    def test_invalid_extension(self, app: Flask):
        api = WebappLogoWorkspaceApi()
        method = unwrap(api.post)
        file = MagicMock(filename="test.txt")
        user = make_account()
        with app.test_request_context("/upload", data={"file": file}):
            with pytest.raises(UnsupportedFileTypeError):
                method(api, user)

    def test_upload_success(self, app: Flask):
        api = WebappLogoWorkspaceApi()
        method = unwrap(api.post)
        file = FileStorage(stream=BytesIO(b"data"), filename="logo.png", content_type="image/png")
        upload = MagicMock(id="file1")
        user = make_account()
        with (
            app.test_request_context("/upload", data={"file": file}, content_type="multipart/form-data"),
            patch("controllers.console.workspace.workspace.FileService") as fs,
            patch("controllers.console.workspace.workspace.db") as mock_db,
        ):
            mock_db.engine = MagicMock()
            fs.return_value.upload_file.return_value = upload
            result, status = method(api, user)
        assert status == HTTPStatus.CREATED
        assert result == {"id": "file1"}
        assert WorkspaceLogoUploadResponse.model_validate(result).model_dump(mode="json") == {"id": "file1"}

    def test_filename_missing(self, app: Flask):
        api = WebappLogoWorkspaceApi()
        method = unwrap(api.post)
        file = FileStorage(stream=BytesIO(b"data"), filename="", content_type="image/png")
        user = make_account()
        with app.test_request_context("/upload", data={"file": file}, content_type="multipart/form-data"):
            with pytest.raises(FilenameNotExistsError):
                method(api, user)

    def test_file_too_large(self, app: Flask):
        api = WebappLogoWorkspaceApi()
        method = unwrap(api.post)
        file = FileStorage(stream=BytesIO(b"x"), filename="logo.png", content_type="image/png")
        user = make_account()
        with (
            app.test_request_context("/upload", data={"file": file}, content_type="multipart/form-data"),
            patch("controllers.console.workspace.workspace.FileService") as fs,
            patch("controllers.console.workspace.workspace.db") as mock_db,
        ):
            mock_db.engine = MagicMock()
            fs.return_value.upload_file.side_effect = services.errors.file.FileTooLargeError("too big")
            with pytest.raises(FileTooLargeError):
                method(api, user)

    def test_service_unsupported_file(self, app: Flask):
        api = WebappLogoWorkspaceApi()
        method = unwrap(api.post)
        file = FileStorage(stream=BytesIO(b"x"), filename="logo.png", content_type="image/png")
        user = make_account()
        with (
            app.test_request_context("/upload", data={"file": file}, content_type="multipart/form-data"),
            patch("controllers.console.workspace.workspace.FileService") as fs,
            patch("controllers.console.workspace.workspace.db") as mock_db,
        ):
            mock_db.engine = MagicMock()
            fs.return_value.upload_file.side_effect = services.errors.file.UnsupportedFileTypeError()
            with pytest.raises(UnsupportedFileTypeError):
                method(api, user)


class TestWorkspaceInfoApi:
    def test_post_success(self, app: Flask, workspace_session: scoped_session[Session]):
        api = WorkspaceInfoApi()
        method = unwrap(api.post)
        tenant = make_tenant()
        workspace_session.add(tenant)
        workspace_session.commit()
        user = make_account_with_tenant(tenant)

        payload = {"name": "New Name"}
        events = []
        with (
            app.test_request_context("/workspaces/info", json=payload),
            patch("controllers.console.workspace.workspace.TenantService.is_workspace_owner", return_value=True),
            patch(
                "controllers.console.workspace.workspace.WorkspaceService.get_tenant_info",
                side_effect=lambda *args, **kwargs: (
                    events.append("get_tenant_info") or {"id": "t1", "name": "New Name"}
                ),
            ),
        ):
            session = workspace_session()
            event.listen(session, "after_commit", lambda _session: events.append("commit"))
            result = method(api, session, user)
        assert result["result"] == "success"
        assert events == ["commit", "get_tenant_info"]

    def test_no_current_tenant(self, app: Flask):
        api = WorkspaceInfoApi()
        method = unwrap(api.post)
        payload = {"name": "X"}
        with app.test_request_context("/workspaces/info", json=payload):
            with pytest.raises(ValueError):
                method(api, MagicMock(), make_account())

    def test_post_not_owner(self, app: Flask, workspace_session: scoped_session[Session]):
        api = WorkspaceInfoApi()
        method = unwrap(api.post)
        tenant = make_tenant()
        workspace_session.add(tenant)
        workspace_session.commit()
        user = make_account_with_tenant(tenant)

        with (
            app.test_request_context("/workspaces/info", json={"name": "Hijack"}),
            patch("controllers.console.workspace.workspace.TenantService.is_workspace_owner", return_value=False),
        ):
            with pytest.raises(WorkspaceNotOwnerError) as exc_info:
                method(api, workspace_session(), user)

        assert exc_info.value.code == HTTPStatus.FORBIDDEN
        assert exc_info.value.error_code == "not_owner"


class TestWorkspacePermissionApi:
    def test_get_success(self, app: Flask):
        api = WorkspacePermissionApi()
        method = unwrap(api.get)
        permission = MagicMock(workspace_id="t1", allow_member_invite=True, allow_owner_transfer=False)
        with (
            app.test_request_context("/permission"),
            patch(
                "controllers.console.workspace.workspace.EnterpriseService.WorkspacePermissionService.get_permission",
                return_value=permission,
            ),
        ):
            result, status = method(api, "t1")
        assert status == HTTPStatus.OK
        expected = {"workspace_id": "t1", "allow_member_invite": True, "allow_owner_transfer": False}
        assert result == expected
        assert WorkspacePermissionResponse.model_validate(result).model_dump(mode="json") == expected

    def test_no_current_tenant(self, app: Flask):
        api = WorkspacePermissionApi()
        method = unwrap(api.get)
        with app.test_request_context("/permission"):
            with pytest.raises(ValueError):
                method(api, None)


class TestArchiveWorkspaceApi:
    def test_archives_and_switches(self, app: Flask):
        api = ArchiveWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant("t1")
        next_tenant = make_tenant("t2")
        user = make_account()
        session = MagicMock()
        session.get.return_value = tenant

        with (
            app.test_request_context("/workspaces/archive", json={"tenant_id": "t1"}),
            patch("controllers.console.workspace.workspace.TenantService.get_tenant_by_id", return_value=tenant),
            patch("controllers.console.workspace.workspace.TenantService.is_workspace_owner", return_value=True),
            patch(
                "controllers.console.workspace.workspace.TenantService.archive_tenant",
                return_value=next_tenant,
            ) as archive_tenant,
            patch(
                "controllers.console.workspace.workspace.WorkspaceService.get_tenant_info",
                return_value={"id": "t2"},
            ),
        ):
            result = method(api, session, user)

        assert result["result"] == "success"
        assert result["switched"] is True
        archive_tenant.assert_called_once_with(tenant, user, session=session)

    def test_non_owner_is_404(self, app: Flask):
        api = ArchiveWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant("t1")
        with (
            app.test_request_context("/workspaces/archive", json={"tenant_id": "t1"}),
            patch("controllers.console.workspace.workspace.TenantService.get_tenant_by_id", return_value=tenant),
            patch("controllers.console.workspace.workspace.TenantService.is_workspace_owner", return_value=False),
        ):
            with pytest.raises(WorkspaceNotFoundError):
                method(api, MagicMock(), make_account())

    def test_last_workspace_is_400(self, app: Flask):
        api = ArchiveWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant("t1")
        with (
            app.test_request_context("/workspaces/archive", json={"tenant_id": "t1"}),
            patch("controllers.console.workspace.workspace.TenantService.get_tenant_by_id", return_value=tenant),
            patch("controllers.console.workspace.workspace.TenantService.is_workspace_owner", return_value=True),
            patch(
                "controllers.console.workspace.workspace.TenantService.archive_tenant",
                side_effect=CannotArchiveLastWorkspaceServiceError(),
            ),
        ):
            with pytest.raises(CannotArchiveLastWorkspaceError):
                method(api, MagicMock(), make_account())


class TestLeaveWorkspaceApi:
    def test_owner_cannot_leave(self, app: Flask):
        api = LeaveWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant("t1")
        with (
            app.test_request_context("/workspaces/leave", json={"tenant_id": "t1"}),
            patch("controllers.console.workspace.workspace.TenantService.get_tenant_by_id", return_value=tenant),
            patch("controllers.console.workspace.workspace.TenantService.is_member", return_value=True),
            patch(
                "controllers.console.workspace.workspace.TenantService.leave_tenant",
                side_effect=OwnerCannotLeaveServiceError(),
            ),
        ):
            with pytest.raises(OwnerCannotLeaveError):
                method(api, MagicMock(), make_account())


class TestUnarchiveWorkspaceApi:
    def test_unarchives_owned_workspace(self, app: Flask):
        api = UnarchiveWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant("t1", status=TenantStatus.ARCHIVE)
        user = make_account()
        session = MagicMock()
        with (
            app.test_request_context("/workspaces/unarchive", json={"tenant_id": "t1"}),
            patch("controllers.console.workspace.workspace.TenantService.get_tenant_by_id", return_value=tenant),
            patch("controllers.console.workspace.workspace.TenantService.is_workspace_owner", return_value=True),
            patch("controllers.console.workspace.workspace.TenantService.unarchive_tenant") as unarchive,
        ):
            result = method(api, session, user)

        assert result["result"] == "success"
        unarchive.assert_called_once_with(tenant, session=session)

    def test_non_owner_is_404(self, app: Flask):
        api = UnarchiveWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant("t1", status=TenantStatus.ARCHIVE)
        with (
            app.test_request_context("/workspaces/unarchive", json={"tenant_id": "t1"}),
            patch("controllers.console.workspace.workspace.TenantService.get_tenant_by_id", return_value=tenant),
            patch("controllers.console.workspace.workspace.TenantService.is_workspace_owner", return_value=False),
        ):
            with pytest.raises(WorkspaceNotFoundError):
                method(api, MagicMock(), make_account())


class TestArchivedWorkspaceListApi:
    def test_get_lists_archived_workspaces(self):
        api = ArchivedWorkspaceListApi()
        method = unwrap(api.get)
        request_context = RequestContext(
            request_id="request-1",
            trace_id="trace-1",
            account_id="account-1",
            active_workspace_id="workspace-1",
        )
        created_at = naive_utc_now()
        workspaces = MagicMock()
        workspaces.list_archived_for_account.return_value = (
            WorkspaceRecord(
                id="workspace-3",
                name="Archived",
                status=TenantStatus.ARCHIVE.value,
                created_at=created_at,
                last_opened_at=None,
            ),
        )
        plans = MagicMock()
        plans.resolve_many.return_value = {}
        workspace_queries = WorkspaceQueryService(workspaces=workspaces, plans=plans)
        application_services_mock = SimpleNamespace(workspace_queries=workspace_queries)
        session = MagicMock()
        session.get.return_value = None

        with patch(
            "controllers.console.workspace.workspace.application_services", return_value=application_services_mock
        ):
            result, status = method(api, session, request_context)

        assert status == HTTPStatus.OK
        assert result["workspaces"][0]["id"] == "workspace-3"
        assert result["workspaces"][0]["status"] == "archive"
        workspaces.list_archived_for_account.assert_called_once_with("account-1")


class TestAdminUnarchiveWorkspaceApi:
    def test_unarchive_success(self, app: Flask):
        api = AdminUnarchiveWorkspaceApi()
        method = unwrap(api.post)
        tenant = make_tenant("t1", status=TenantStatus.ARCHIVE)
        with (
            app.test_request_context("/all-workspaces/t1/unarchive"),
            patch("controllers.console.workspace.workspace.TenantService.get_tenant_by_id", return_value=tenant),
            patch("controllers.console.workspace.workspace.TenantService.unarchive_tenant") as unarchive,
        ):
            result = method(api, MagicMock(), "t1")

        assert result["result"] == "success"
        unarchive.assert_called_once()


class TestAdminWorkspaceInfoApi:
    def test_renames_workspace(self, app: Flask, workspace_session: scoped_session[Session]):
        tenant = make_tenant("t1", name="Old Name")
        workspace_session.add(tenant)
        workspace_session.commit()
        api = AdminWorkspaceInfoApi()
        method = unwrap(api.post)

        with app.test_request_context("/all-workspaces/t1/info", json={"name": "  New Name  "}):
            result = method(api, workspace_session, "t1")

        assert result["result"] == "success"
        assert result["tenant"]["id"] == "t1"
        assert result["tenant"]["name"] == "New Name"
        assert workspace_session.get(Tenant, "t1").name == "New Name"

    def test_missing_workspace_is_404(self, app: Flask, workspace_session: scoped_session[Session]):
        api = AdminWorkspaceInfoApi()
        method = unwrap(api.post)

        with app.test_request_context("/all-workspaces/missing/info", json={"name": "New Name"}):
            with pytest.raises(WorkspaceNotFoundError):
                method(api, workspace_session, "missing")
