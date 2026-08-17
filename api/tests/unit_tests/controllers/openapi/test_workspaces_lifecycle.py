"""OpenAPI workspace create / archive / leave."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from inspect import unwrap
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest
from flask import Flask
from pydantic import ValidationError
from sqlalchemy.orm import Session
from werkzeug.exceptions import NotFound, UnprocessableEntity

from controllers.openapi import workspaces as workspaces_module
from controllers.openapi._errors import (
    CannotArchiveLastWorkspace,
    CannotLeaveLastWorkspace,
    NotAllowedCreateWorkspace,
    OwnerCannotLeave,
    WorkspaceNotArchived,
    WorkspacesLimitExceeded,
)
from controllers.openapi._models import WorkspaceCreatePayload
from controllers.openapi.auth.data import AuthData
from controllers.openapi.workspaces import (
    WorkspaceArchiveApi,
    WorkspaceLeaveApi,
    WorkspacesApi,
    WorkspaceUnarchiveApi,
)
from libs.oauth_bearer import AuthContext, Scope, SubjectType, TokenType, reset_auth_ctx, set_auth_ctx
from models import Account, Tenant, TenantAccountJoin
from models.account import AccountStatus, TenantAccountRole, TenantStatus
from services.account_service import TenantService as RealTenantService
from services.errors.workspace import (
    CannotArchiveLastWorkspaceError,
    CannotLeaveLastWorkspaceError,
    OwnerCannotLeaveError,
    WorkSpaceNotAllowedCreateError,
    WorkspaceNotArchivedError,
    WorkspacesLimitExceededError,
)

_seed_tokens: list = []


def _seed(ctx: AuthContext) -> None:
    _seed_tokens.append(set_auth_ctx(ctx))


@pytest.fixture(autouse=True)
def _reset_auth_ctx():
    yield
    while _seed_tokens:
        reset_auth_ctx(_seed_tokens.pop())


@pytest.fixture
def database_session(sqlite_session: Session):
    return sqlite_session


def _auth_ctx(account_id: uuid.UUID) -> AuthContext:
    return AuthContext(
        subject_type=SubjectType.ACCOUNT,
        subject_email="caller@example.com",
        subject_issuer="dify:account",
        account_id=account_id,
        client_id="difyctl",
        scopes=frozenset({Scope.FULL}),
        token_id=uuid.uuid4(),
        token_type=TokenType.OAUTH_ACCOUNT,
        expires_at=datetime.now(UTC),
        token_hash="h",
        verified_tenants={},
    )


def _auth_data(account_id: uuid.UUID) -> AuthData:
    return AuthData(
        token_type=TokenType.OAUTH_ACCOUNT,
        account_id=account_id,
        token_hash="testhash",
        scopes=frozenset({Scope.FULL}),
    )


def _account(account_id: str, email: str = "u@example.com") -> Account:
    account = Account(name="User", email=email, status=AccountStatus.ACTIVE)
    account.id = account_id
    return account


def _persist_workspace(
    session: Session,
    workspace_id: str,
    memberships: list[tuple[str, str, TenantAccountRole, bool]],
    *,
    name: str = "WS",
) -> Tenant:
    tenant = Tenant(name=name, status=TenantStatus.NORMAL)
    tenant.id = workspace_id
    tenant.created_at = datetime(2026, 5, 18)
    session.add(tenant)
    for account_id, email, role, current in memberships:
        if session.get(Account, account_id) is None:
            session.add(_account(account_id=account_id, email=email))
        session.add(TenantAccountJoin(tenant_id=tenant.id, account_id=account_id, current=current, role=role))
    session.commit()
    return tenant


def _lock() -> MagicMock:
    lock = MagicMock()
    lock.__enter__ = MagicMock(return_value=lock)
    lock.__exit__ = MagicMock(return_value=False)
    return lock


def test_create_payload_strips_name_and_rejects_blank():
    assert WorkspaceCreatePayload.model_validate({"name": "  Team  "}).name == "Team"
    with pytest.raises(ValidationError):
        WorkspaceCreatePayload.model_validate({"name": "   "})
    with pytest.raises(ValidationError):
        WorkspaceCreatePayload.model_validate({"name": "Team", "extra": "x"})


def test_create_rejects_invalid_body_with_422(app: Flask):
    acct_id = uuid.uuid4()
    api = WorkspacesApi()
    with app.test_request_context(
        "/openapi/v1/workspaces",
        method="POST",
        data=json.dumps({"name": "   "}),
        content_type="application/json",
    ):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(UnprocessableEntity):
            api.post.__wrapped__(api, auth_data=_auth_data(acct_id))


def test_create_switches_to_new_workspace(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    new_id = str(uuid.uuid4())
    api = WorkspacesApi()
    tenant = _persist_workspace(
        database_session,
        new_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.OWNER, False)],
        name="Ops Space",
    )

    monkeypatch.setattr(workspaces_module.redis_client, "lock", Mock(return_value=_lock()))
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            create_owner_tenant=Mock(return_value=tenant),
            switch_tenant=RealTenantService.switch_tenant,
            find_workspace_for_account=RealTenantService.find_workspace_for_account,
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
        ),
    )

    with app.test_request_context(
        "/openapi/v1/workspaces",
        method="POST",
        data=json.dumps({"name": "  Ops Space  "}),
        content_type="application/json",
    ):
        _seed(_auth_ctx(acct_id))
        body, status = api.post.__wrapped__(api, auth_data=_auth_data(acct_id))

    assert status == 201
    assert body["id"] == new_id
    assert body["name"] == "Ops Space"
    assert body["current"] is True
    workspaces_module.TenantService.create_owner_tenant.assert_called_once()
    _, kwargs = workspaces_module.TenantService.create_owner_tenant.call_args
    assert kwargs["name"] == "Ops Space"


def test_create_not_allowed(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    database_session.add(_account(str(acct_id), "caller@example.com"))
    database_session.commit()
    api = WorkspacesApi()

    monkeypatch.setattr(workspaces_module.redis_client, "lock", Mock(return_value=_lock()))
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            create_owner_tenant=Mock(side_effect=WorkSpaceNotAllowedCreateError()),
        ),
    )

    with app.test_request_context(
        "/openapi/v1/workspaces",
        method="POST",
        data=json.dumps({"name": "Denied"}),
        content_type="application/json",
    ):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(NotAllowedCreateWorkspace):
            api.post.__wrapped__(api, auth_data=_auth_data(acct_id))


def test_create_limit_exceeded(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    database_session.add(_account(str(acct_id), "caller@example.com"))
    database_session.commit()
    api = WorkspacesApi()

    monkeypatch.setattr(workspaces_module.redis_client, "lock", Mock(return_value=_lock()))
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            create_owner_tenant=Mock(side_effect=WorkspacesLimitExceededError()),
        ),
    )

    with app.test_request_context(
        "/openapi/v1/workspaces",
        method="POST",
        data=json.dumps({"name": "Overflow"}),
        content_type="application/json",
    ):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(WorkspacesLimitExceeded):
            api.post.__wrapped__(api, auth_data=_auth_data(acct_id))


def test_archive_returns_switched_workspace(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    archived_id = str(uuid.uuid4())
    next_id = str(uuid.uuid4())
    api = WorkspaceArchiveApi()
    _persist_workspace(
        database_session,
        archived_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.OWNER, True)],
        name="Old",
    )
    next_tenant = _persist_workspace(
        database_session,
        next_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.OWNER, False)],
        name="Next",
    )

    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_workspace_owner=Mock(return_value=True),
            archive_tenant=Mock(return_value=next_tenant),
            find_workspace_for_account=RealTenantService.find_workspace_for_account,
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{archived_id}:archive", method="POST"):
        _seed(_auth_ctx(acct_id))
        body, status = api.post.__wrapped__(api, workspace_id=archived_id, auth_data=_auth_data(acct_id))

    assert status == 200
    assert body["result"] == "success"
    assert body["switched"] is True
    assert body["workspace"]["id"] == next_id


def test_archive_non_owner_is_404(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    ws_id = str(uuid.uuid4())
    api = WorkspaceArchiveApi()
    _persist_workspace(
        database_session,
        ws_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.ADMIN, True)],
    )
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_workspace_owner=Mock(return_value=False),
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{ws_id}:archive", method="POST"):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(NotFound):
            api.post.__wrapped__(api, workspace_id=ws_id, auth_data=_auth_data(acct_id))


def test_archive_last_workspace_is_400(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    ws_id = str(uuid.uuid4())
    api = WorkspaceArchiveApi()
    _persist_workspace(
        database_session,
        ws_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.OWNER, True)],
    )
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_workspace_owner=Mock(return_value=True),
            archive_tenant=Mock(side_effect=CannotArchiveLastWorkspaceError()),
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{ws_id}:archive", method="POST"):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(CannotArchiveLastWorkspace):
            api.post.__wrapped__(api, workspace_id=ws_id, auth_data=_auth_data(acct_id))


def test_leave_owner_is_400(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    ws_id = str(uuid.uuid4())
    api = WorkspaceLeaveApi()
    _persist_workspace(
        database_session,
        ws_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.OWNER, True)],
    )
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_member=Mock(return_value=True),
            leave_tenant=Mock(side_effect=OwnerCannotLeaveError()),
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{ws_id}:leave", method="POST"):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(OwnerCannotLeave):
            api.post.__wrapped__(api, workspace_id=ws_id, auth_data=_auth_data(acct_id))


def test_leave_last_workspace_is_400(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    ws_id = str(uuid.uuid4())
    api = WorkspaceLeaveApi()
    _persist_workspace(
        database_session,
        ws_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.NORMAL, True)],
    )
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_member=Mock(return_value=True),
            leave_tenant=Mock(side_effect=CannotLeaveLastWorkspaceError()),
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{ws_id}:leave", method="POST"):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(CannotLeaveLastWorkspace):
            api.post.__wrapped__(api, workspace_id=ws_id, auth_data=_auth_data(acct_id))


def test_leave_returns_next_workspace(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    left_id = str(uuid.uuid4())
    next_id = str(uuid.uuid4())
    api = WorkspaceLeaveApi()
    _persist_workspace(
        database_session,
        left_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.NORMAL, True)],
    )
    next_tenant = _persist_workspace(
        database_session,
        next_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.NORMAL, False)],
    )
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_member=Mock(return_value=True),
            leave_tenant=Mock(return_value=next_tenant),
            find_workspace_for_account=RealTenantService.find_workspace_for_account,
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{left_id}:leave", method="POST"):
        _seed(_auth_ctx(acct_id))
        body, status = api.post.__wrapped__(api, workspace_id=left_id, auth_data=_auth_data(acct_id))

    assert status == 200
    assert body["switched"] is True
    assert body["workspace"]["id"] == next_id


def test_unarchive_restores_workspace(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    ws_id = str(uuid.uuid4())
    api = WorkspaceUnarchiveApi()
    tenant = Tenant(name="Archived", status=TenantStatus.ARCHIVE)
    tenant.id = ws_id
    tenant.created_at = datetime(2026, 5, 18)
    database_session.add(_account(str(acct_id), "caller@example.com"))
    database_session.add(tenant)
    database_session.add(
        TenantAccountJoin(tenant_id=ws_id, account_id=str(acct_id), current=False, role=TenantAccountRole.OWNER)
    )
    database_session.commit()
    restored = Tenant(name="Archived", status=TenantStatus.NORMAL)
    restored.id = ws_id
    membership = TenantAccountJoin(
        tenant_id=ws_id, account_id=str(acct_id), current=False, role=TenantAccountRole.OWNER
    )
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_workspace_owner=Mock(return_value=True),
            unarchive_tenant=Mock(),
            find_workspace_for_account=Mock(return_value=(restored, membership)),
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{ws_id}:unarchive", method="POST"):
        _seed(_auth_ctx(acct_id))
        body = unwrap(api.post)(api, database_session, workspace_id=ws_id, auth_data=_auth_data(acct_id))

    assert body.id == ws_id
    workspaces_module.TenantService.unarchive_tenant.assert_called_once()


def test_unarchive_not_archived_is_409(app: Flask, monkeypatch: pytest.MonkeyPatch, database_session: Session):
    acct_id = uuid.uuid4()
    ws_id = str(uuid.uuid4())
    api = WorkspaceUnarchiveApi()
    _persist_workspace(
        database_session,
        ws_id,
        [(str(acct_id), "caller@example.com", TenantAccountRole.OWNER, True)],
    )
    monkeypatch.setattr(
        workspaces_module,
        "TenantService",
        SimpleNamespace(
            get_tenant_by_id=RealTenantService.get_tenant_by_id,
            is_workspace_owner=Mock(return_value=True),
            unarchive_tenant=Mock(side_effect=WorkspaceNotArchivedError()),
        ),
    )

    with app.test_request_context(f"/openapi/v1/workspaces/{ws_id}:unarchive", method="POST"):
        _seed(_auth_ctx(acct_id))
        with pytest.raises(WorkspaceNotArchived):
            api.post.__wrapped__(api, workspace_id=ws_id, auth_data=_auth_data(acct_id))
