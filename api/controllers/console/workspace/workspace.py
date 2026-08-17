import logging
from collections.abc import Sequence
from datetime import datetime
from http import HTTPStatus
from typing import NoReturn

from flask import request
from flask_restx import Resource
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from werkzeug.exceptions import NotFound

import services
from configs import dify_config
from controllers.common.errors import (
    FilenameNotExistsError,
    FileTooLargeError,
    NoFileUploadedError,
    TooManyFilesError,
    UnsupportedFileTypeError,
)
from controllers.common.fields import SimpleResultResponse
from controllers.common.schema import (
    query_params_from_model,
    query_params_from_request,
    register_response_schema_models,
    register_schema_models,
)
from controllers.common.session import with_session
from controllers.console import console_ns
from controllers.console.admin import admin_required
from controllers.console.error import AccountNotLinkTenantError, NotAllowedCreateWorkspace, WorkspacesLimitExceeded
from controllers.console.flask_admission import console_account_admission
from controllers.console.workspace.error import (
    AccountAlreadyExistsError,
    AccountNotFoundForAssignmentError,
    AccountPasswordRequiredError,
    CannotArchiveLastWorkspaceError,
    CannotLeaveLastWorkspaceError,
    CurrentWorkspaceArchivedError,
    InvalidMemberRoleError,
    OwnerAccountNotFoundError,
    OwnerCannotLeaveError,
    WorkspaceAlreadyArchivedError,
    WorkspaceNotArchivedError,
    WorkspaceNotFoundError,
    WorkspaceNotOwnerError,
)
from controllers.console.wraps import (
    account_initialization_required,
    cloud_edition_billing_resource_check,
    only_edition_enterprise,
    setup_required,
    with_current_tenant_id,
    with_current_user,
)
from enums import CloudPlan
from extensions.ext_application_services import application_services
from extensions.ext_database import db
from extensions.ext_redis import redis_client
from fields.base import ResponseModel
from libs.helper import EmailStr, dump_response, escape_like_pattern, to_timestamp
from libs.login import login_required
from libs.pagination import paginate_query
from machinery.context import RequestContext
from models.account import Account, Tenant, TenantAccountJoin, TenantAccountRole, TenantCustomConfigDict, TenantStatus
from services.account_service import AccountService, TenantService
from services.enterprise.enterprise_service import EnterpriseService
from services.errors import workspace as workspace_errors
from services.errors.account import (
    AccountPasswordRequiredError as AccountPasswordRequiredServiceError,
)
from services.errors.account import (
    InvalidActionError,
)
from services.errors.workspace import WorkSpaceNotAllowedCreateError, WorkspacesLimitExceededError
from services.feature_service import FeatureService
from services.file_service import FileService
from services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)


class WorkspaceListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=255)
    status: TenantStatus | None = Field(default=None)

    @field_validator("keyword", mode="before")
    @classmethod
    def empty_keyword(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped or None

    @field_validator("status", mode="before")
    @classmethod
    def empty_status(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return value


class SwitchWorkspacePayload(BaseModel):
    tenant_id: str


class WorkspaceCustomConfigPayload(BaseModel):
    remove_webapp_brand: bool | None = None
    replace_webapp_logo: str | None = None


class WorkspaceCustomConfigResponse(ResponseModel):
    remove_webapp_brand: bool | None = None
    replace_webapp_logo: str | None = None


def _strip_workspace_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise ValueError("name is required")
    return name


class WorkspaceInfoPayload(BaseModel):
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return _strip_workspace_name(value)


class WorkspaceCreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return _strip_workspace_name(value)


class AdminWorkspaceCreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    owner_email: EmailStr

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return _strip_workspace_name(value)

    @field_validator("owner_email")
    @classmethod
    def strip_owner_email(cls, value: str) -> str:
        return value.strip()


class WorkspaceTenantPayload(BaseModel):
    tenant_id: str


class TenantInfoResponse(ResponseModel):
    id: str
    name: str | None = None
    plan: CloudPlan | None = None
    status: str | None = None
    created_at: int | None = None
    role: str | None = None
    in_trial: bool | None = None
    trial_end_reason: str | None = None
    custom_config: WorkspaceCustomConfigResponse | None = None
    trial_credits: int | None = None
    trial_credits_used: int | None = None
    trial_credits_exhausted_at: int | None = None
    next_credit_reset_date: int | None = None

    @field_validator("status", "trial_end_reason", mode="before")
    @classmethod
    def _normalize_enum_like(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return str(getattr(value, "value", value))

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_created_at(cls, value: datetime | int | None):
        return to_timestamp(value)


class CurrentWorkspaceSummaryResponse(ResponseModel):
    id: str
    name: str
    role: TenantAccountRole
    plan: CloudPlan | None
    credits: int | None = Field(description="Remaining credits in the effective pool; -1 means unlimited.")
    is_owner: bool = False


class TenantListItemResponse(ResponseModel):
    id: str
    name: str | None = None
    plan: CloudPlan | None = None
    status: str | None = None
    created_at: int | None = None
    last_opened_at: int | None = None
    current: bool
    role: str | None = None
    is_owner: bool = False

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_enum_like(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return str(getattr(value, "value", value))

    @field_validator("created_at", "last_opened_at", mode="before")
    @classmethod
    def _normalize_timestamp(cls, value: datetime | int | None):
        return to_timestamp(value)


class TenantListResponse(ResponseModel):
    workspaces: list[TenantListItemResponse]


class WorkspaceListItemResponse(ResponseModel):
    id: str
    name: str | None = None
    status: str | None = None
    created_at: int | None = None
    member_count: int = 0

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_enum_like(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return str(getattr(value, "value", value))

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_created_at(cls, value: datetime | int | None):
        return to_timestamp(value)


class WorkspacePaginationResponse(ResponseModel):
    data: list[WorkspaceListItemResponse]
    has_more: bool
    limit: int
    page: int
    total: int


class SwitchWorkspaceResponse(ResponseModel):
    result: str
    new_tenant: TenantInfoResponse


class WorkspaceLifecycleResponse(ResponseModel):
    result: str
    switched: bool
    new_tenant: TenantInfoResponse | None = None


class WorkspaceTenantResultResponse(ResponseModel):
    result: str
    tenant: TenantInfoResponse


class WorkspaceLogoUploadResponse(ResponseModel):
    id: str


class WorkspacePermissionResponse(ResponseModel):
    workspace_id: str
    allow_member_invite: bool
    allow_owner_transfer: bool


class WorkspaceQuotaResponse(ResponseModel):
    enabled: bool
    size: int
    limit: int


class WorkspacePolicyResponse(ResponseModel):
    is_allow_create_workspace: bool
    workspaces: WorkspaceQuotaResponse


class AccountListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=255)


class AdminAccountCreatePayload(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=255)
    language: str | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()


class AdminMemberAssignPayload(BaseModel):
    email: str
    role: str
    name: str | None = None
    password: str | None = None
    language: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, email: str) -> str:
        return email.strip().lower()


class AdminMemberRolePayload(BaseModel):
    role: str


class AccountMembershipResponse(ResponseModel):
    tenant_id: str
    tenant_name: str
    role: str
    status: str


class AdminAccountItemResponse(ResponseModel):
    id: str
    name: str
    email: str
    status: str
    created_at: int | None = None
    memberships: list[AccountMembershipResponse] = Field(default_factory=list)

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_created_at(cls, value: datetime | int | None):
        return to_timestamp(value)


class AdminAccountPaginationResponse(ResponseModel):
    data: list[AdminAccountItemResponse]
    has_more: bool
    limit: int
    page: int
    total: int


class AdminAccountCreateResponse(ResponseModel):
    result: str
    account: AdminAccountItemResponse


class AdminMemberItemResponse(ResponseModel):
    id: str
    name: str
    email: str
    role: str
    status: str


class AdminMemberListResponse(ResponseModel):
    data: list[AdminMemberItemResponse]


class AdminMemberAssignResponse(ResponseModel):
    result: str
    created_account: bool
    added: bool
    member: AdminMemberItemResponse


WORKSPACE_LOGO_UPLOAD_PARAMS = {
    "file": {
        "in": "formData",
        "type": "file",
        "required": True,
        "description": "Workspace web app logo file. Only SVG and PNG files are supported.",
    }
}


register_schema_models(
    console_ns,
    WorkspaceListQuery,
    SwitchWorkspacePayload,
    WorkspaceCustomConfigPayload,
    WorkspaceInfoPayload,
    WorkspaceCreatePayload,
    AdminWorkspaceCreatePayload,
    WorkspaceTenantPayload,
    AccountListQuery,
    AdminAccountCreatePayload,
    AdminMemberAssignPayload,
    AdminMemberRolePayload,
)
register_response_schema_models(
    console_ns,
    CurrentWorkspaceSummaryResponse,
    TenantInfoResponse,
    TenantListItemResponse,
    TenantListResponse,
    WorkspaceCustomConfigResponse,
    WorkspaceListItemResponse,
    WorkspacePaginationResponse,
    SwitchWorkspaceResponse,
    WorkspaceTenantResultResponse,
    WorkspaceLogoUploadResponse,
    WorkspacePermissionResponse,
    WorkspaceQuotaResponse,
    WorkspacePolicyResponse,
    WorkspaceLifecycleResponse,
    SimpleResultResponse,
    AccountMembershipResponse,
    AdminAccountItemResponse,
    AdminAccountPaginationResponse,
    AdminAccountCreateResponse,
    AdminMemberItemResponse,
    AdminMemberListResponse,
    AdminMemberAssignResponse,
)


@console_ns.route("/workspaces")
class TenantListApi(Resource):
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[TenantListResponse.__name__])
    @console_account_admission()
    @with_session(write=False)
    def get(self, session: Session, request_context: RequestContext):
        workspaces = application_services().workspace_queries.list_for_account(request_context)
        account = session.get(Account, request_context.account_id)
        enriched = []
        for workspace in workspaces:
            tenant = session.get(Tenant, workspace.id)
            is_owner = bool(
                account is not None
                and tenant is not None
                and TenantService.is_workspace_owner(account, tenant, session=session)
            )
            enriched.append(workspace._replace(is_owner=is_owner))
        return dump_response(TenantListResponse, {"workspaces": enriched}), HTTPStatus.OK

    @console_ns.expect(console_ns.models[WorkspaceCreatePayload.__name__])
    @console_ns.response(HTTPStatus.CREATED, "Workspace created", console_ns.models[SwitchWorkspaceResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_user
    @with_session
    def post(self, session: Session, current_user: Account):
        args = WorkspaceCreatePayload.model_validate(console_ns.payload or {})
        with redis_client.lock(f"workspace_create:{current_user.id}", timeout=60):
            try:
                tenant = TenantService.create_owner_tenant(current_user, name=args.name, session=session)
            except (WorkSpaceNotAllowedCreateError, NotAllowedCreateWorkspace):
                raise NotAllowedCreateWorkspace()
            except WorkspacesLimitExceededError:
                raise WorkspacesLimitExceeded()
            TenantService.switch_tenant(current_user, tenant.id, session=session)

        logger.info("workspace_created account_id=%s tenant_id=%s source=console", current_user.id, tenant.id)
        return (
            SwitchWorkspaceResponse(
                result="success",
                new_tenant=WorkspaceService.get_tenant_info(tenant, session=session),
            ).model_dump(mode="json"),
            HTTPStatus.CREATED,
        )


@console_ns.route("/workspaces/policy")
class WorkspacePolicyApi(Resource):
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspacePolicyResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    def get(self):
        is_allowed, workspaces = FeatureService.get_workspace_creation_policy()
        return dump_response(
            WorkspacePolicyResponse,
            {
                "is_allow_create_workspace": is_allowed,
                "workspaces": {
                    "enabled": workspaces.enabled,
                    "size": workspaces.size,
                    "limit": workspaces.limit,
                },
            },
        ), HTTPStatus.OK


def _lifecycle_response(session: Session, next_tenant: Tenant | None) -> dict:
    new_tenant = WorkspaceService.get_tenant_info(next_tenant, session=session) if next_tenant else None
    return WorkspaceLifecycleResponse(
        result="success",
        switched=next_tenant is not None,
        new_tenant=new_tenant,
    ).model_dump(mode="json")


def _map_lifecycle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, workspace_errors.WorkspaceAlreadyArchivedError):
        raise WorkspaceAlreadyArchivedError()
    if isinstance(exc, workspace_errors.WorkspaceNotArchivedError):
        raise WorkspaceNotArchivedError()
    if isinstance(exc, workspace_errors.CannotArchiveLastWorkspaceError):
        raise CannotArchiveLastWorkspaceError()
    if isinstance(exc, workspace_errors.CannotLeaveLastWorkspaceError):
        raise CannotLeaveLastWorkspaceError()
    if isinstance(exc, workspace_errors.OwnerCannotLeaveError):
        raise OwnerCannotLeaveError()
    if isinstance(exc, WorkspacesLimitExceededError):
        raise WorkspacesLimitExceeded()
    raise exc


@console_ns.route("/workspaces/archive")
class ArchiveWorkspaceApi(Resource):
    @console_ns.expect(console_ns.models[WorkspaceTenantPayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspaceLifecycleResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_user
    @with_session
    def post(self, session: Session, current_user: Account):
        args = WorkspaceTenantPayload.model_validate(console_ns.payload or {})
        tenant = TenantService.get_tenant_by_id(args.tenant_id, session=session)
        if tenant is None or not TenantService.is_workspace_owner(current_user, tenant, session=session):
            raise WorkspaceNotFoundError()
        try:
            next_tenant = TenantService.archive_tenant(tenant, current_user, session=session)
        except Exception as exc:
            _map_lifecycle_error(exc)
        return _lifecycle_response(session, next_tenant)


@console_ns.route("/workspaces/leave")
class LeaveWorkspaceApi(Resource):
    @console_ns.expect(console_ns.models[WorkspaceTenantPayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspaceLifecycleResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_user
    @with_session
    def post(self, session: Session, current_user: Account):
        args = WorkspaceTenantPayload.model_validate(console_ns.payload or {})
        tenant = TenantService.get_tenant_by_id(args.tenant_id, session=session)
        if tenant is None or not TenantService.is_member(current_user, tenant, session=session):
            raise WorkspaceNotFoundError()
        try:
            next_tenant = TenantService.leave_tenant(tenant, current_user, session=session)
        except Exception as exc:
            _map_lifecycle_error(exc)
        return _lifecycle_response(session, next_tenant)


@console_ns.route("/workspaces/unarchive")
class UnarchiveWorkspaceApi(Resource):
    @console_ns.expect(console_ns.models[WorkspaceTenantPayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[SimpleResultResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_user
    @with_session
    def post(self, session: Session, current_user: Account):
        args = WorkspaceTenantPayload.model_validate(console_ns.payload or {})
        tenant = TenantService.get_tenant_by_id(args.tenant_id, session=session)
        if tenant is None or not TenantService.is_workspace_owner(current_user, tenant, session=session):
            raise WorkspaceNotFoundError()
        try:
            TenantService.unarchive_tenant(tenant, session=session)
        except Exception as exc:
            _map_lifecycle_error(exc)
        return SimpleResultResponse(result="success").model_dump(mode="json")


@console_ns.route("/workspaces/archived")
class ArchivedWorkspaceListApi(Resource):
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[TenantListResponse.__name__])
    @console_account_admission()
    @with_session(write=False)
    def get(self, session: Session, request_context: RequestContext):
        workspaces = application_services().workspace_queries.list_archived_for_account(request_context)
        account = session.get(Account, request_context.account_id)
        enriched = []
        for workspace in workspaces:
            tenant = session.get(Tenant, workspace.id)
            is_owner = bool(
                account is not None
                and tenant is not None
                and TenantService.is_workspace_owner(account, tenant, session=session)
            )
            enriched.append(workspace._replace(is_owner=is_owner))
        return dump_response(TenantListResponse, {"workspaces": enriched}), HTTPStatus.OK


@console_ns.route("/all-workspaces/<uuid:workspace_id>/archive")
class AdminArchiveWorkspaceApi(Resource):
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspaceLifecycleResponse.__name__])
    @setup_required
    @admin_required
    @with_session
    def post(self, session: Session, workspace_id: str):
        tenant = TenantService.get_tenant_by_id(str(workspace_id), session=session)
        if tenant is None:
            raise WorkspaceNotFoundError()
        try:
            next_tenant = TenantService.archive_tenant(
                tenant, None, session=session, allow_members_without_other_workspace=True
            )
        except Exception as exc:
            _map_lifecycle_error(exc)
        return _lifecycle_response(session, next_tenant)


@console_ns.route("/all-workspaces/<uuid:workspace_id>/unarchive")
class AdminUnarchiveWorkspaceApi(Resource):
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[SimpleResultResponse.__name__])
    @setup_required
    @admin_required
    @with_session
    def post(self, session: Session, workspace_id: str):
        tenant = TenantService.get_tenant_by_id(str(workspace_id), session=session)
        if tenant is None:
            raise WorkspaceNotFoundError()
        try:
            TenantService.unarchive_tenant(tenant, session=session)
        except Exception as exc:
            _map_lifecycle_error(exc)
        return SimpleResultResponse(result="success").model_dump(mode="json")


def _all_workspaces_stmt(args: WorkspaceListQuery):
    stmt = select(Tenant)
    if args.keyword:
        escaped_keyword = escape_like_pattern(args.keyword)
        stmt = stmt.where(Tenant.name.ilike(f"%{escaped_keyword}%", escape="\\"))
    if args.status is not None:
        stmt = stmt.where(Tenant.status == args.status)
    return stmt.order_by(Tenant.created_at.desc())


def _member_counts_by_tenant_id(session: Session, tenant_ids: Sequence[str]) -> dict[str, int]:
    if not tenant_ids:
        return {}
    rows = session.execute(
        select(TenantAccountJoin.tenant_id, func.count())
        .where(TenantAccountJoin.tenant_id.in_(tenant_ids))
        .group_by(TenantAccountJoin.tenant_id)
    ).all()
    return {tenant_id: int(count) for tenant_id, count in rows}


def _workspace_list_items(session: Session, tenants: Sequence[Tenant]) -> list[dict[str, object]]:
    counts = _member_counts_by_tenant_id(session, [tenant.id for tenant in tenants])
    return [
        {
            "id": tenant.id,
            "name": tenant.name,
            "status": tenant.status,
            "created_at": tenant.created_at,
            "member_count": counts.get(tenant.id, 0),
        }
        for tenant in tenants
    ]


def _admin_tenant_payload(tenant: Tenant) -> dict[str, object]:
    return {
        "id": tenant.id,
        "name": tenant.name,
        "status": tenant.status,
        "created_at": tenant.created_at,
    }


@console_ns.route("/all-workspaces/<uuid:workspace_id>/info")
class AdminWorkspaceInfoApi(Resource):
    @console_ns.expect(console_ns.models[WorkspaceInfoPayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspaceTenantResultResponse.__name__])
    @setup_required
    @admin_required
    @with_session
    def post(self, session: Session, workspace_id: str):
        args = WorkspaceInfoPayload.model_validate(console_ns.payload or {})
        tenant = TenantService.get_tenant_by_id(str(workspace_id), session=session)
        if tenant is None:
            raise WorkspaceNotFoundError()
        tenant.name = args.name
        session.commit()
        return WorkspaceTenantResultResponse(
            result="success",
            tenant=_admin_tenant_payload(tenant),
        ).model_dump(mode="json")


@console_ns.route("/all-workspaces")
class WorkspaceListApi(Resource):
    @console_ns.doc(params=query_params_from_model(WorkspaceListQuery))
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspacePaginationResponse.__name__])
    @setup_required
    @admin_required
    @with_session(write=False)
    def get(self, session: Session):
        args = query_params_from_request(WorkspaceListQuery)

        stmt = _all_workspaces_stmt(args)
        tenants = paginate_query(stmt, session=session, page=args.page, per_page=args.limit)

        return WorkspacePaginationResponse(
            data=_workspace_list_items(session, tenants.items),
            has_more=tenants.has_next,
            limit=args.limit,
            page=args.page,
            total=tenants.total or 0,
        ).model_dump(mode="json"), HTTPStatus.OK

    @console_ns.expect(console_ns.models[AdminWorkspaceCreatePayload.__name__])
    @console_ns.response(
        HTTPStatus.CREATED,
        "Workspace created",
        console_ns.models[WorkspaceTenantResultResponse.__name__],
    )
    @setup_required
    @admin_required
    @with_session
    def post(self, session: Session):
        args = AdminWorkspaceCreatePayload.model_validate(console_ns.payload or {})
        account = AccountService.get_account_by_email_with_case_fallback(args.owner_email, session=session)
        if account is None:
            raise OwnerAccountNotFoundError()

        with redis_client.lock(f"workspace_create:{account.id}", timeout=60):
            try:
                tenant = TenantService.create_owner_tenant(
                    account,
                    name=args.name,
                    is_from_dashboard=True,
                    session=session,
                )
            except (WorkSpaceNotAllowedCreateError, NotAllowedCreateWorkspace):
                raise NotAllowedCreateWorkspace()
            except WorkspacesLimitExceededError:
                raise WorkspacesLimitExceeded()

        logger.info(
            "workspace_created account_id=%s tenant_id=%s source=admin",
            account.id,
            tenant.id,
        )
        return (
            WorkspaceTenantResultResponse(
                result="success",
                tenant=_admin_tenant_payload(tenant),
            ).model_dump(mode="json"),
            HTTPStatus.CREATED,
        )


def _account_memberships(session: Session, account_id: str) -> list[dict[str, object]]:
    rows = TenantService.get_account_memberships(account_id, session=session, status=None)
    return [
        {
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "role": str(join.role),
            "status": str(tenant.status),
        }
        for join, tenant in rows
    ]


def _admin_account_item(session: Session, account: Account) -> dict[str, object]:
    return {
        "id": account.id,
        "name": account.name,
        "email": account.email,
        "status": str(account.status),
        "created_at": account.created_at,
        "memberships": _account_memberships(session, account.id),
    }


def _assign_member(
    session: Session,
    tenant: Tenant,
    args: AdminMemberAssignPayload,
    operator: Account | None,
    *,
    skip_permission_check: bool,
) -> tuple[Account, TenantAccountJoin, bool, bool]:
    if not TenantAccountRole.is_valid_role(args.role) or not TenantAccountRole.is_non_owner_role(
        TenantAccountRole(args.role)
    ):
        raise InvalidMemberRoleError()
    try:
        account, created_account = AccountService.ensure_account_for_assignment(
            email=args.email,
            name=args.name,
            password=args.password,
            language=args.language or "en-US",
            session=session,
        )
        join, added = TenantService.assign_account_to_tenant(
            tenant,
            account,
            args.role,
            operator,
            session=session,
            skip_permission_check=skip_permission_check,
        )
    except AccountPasswordRequiredServiceError as exc:
        raise AccountPasswordRequiredError() from exc
    except InvalidActionError as exc:
        raise InvalidMemberRoleError() from exc
    return account, join, created_account, added


@console_ns.route("/all-accounts")
class AdminAccountListApi(Resource):
    @console_ns.doc(params=query_params_from_model(AccountListQuery))
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[AdminAccountPaginationResponse.__name__])
    @setup_required
    @admin_required
    @with_session(write=False)
    def get(self, session: Session):
        args = query_params_from_request(AccountListQuery)
        stmt = select(Account).order_by(Account.created_at.desc())
        if args.keyword:
            escaped = escape_like_pattern(args.keyword)
            stmt = stmt.where(
                Account.email.ilike(f"%{escaped}%", escape="\\") | Account.name.ilike(f"%{escaped}%", escape="\\")
            )
        page = paginate_query(stmt, session=session, page=args.page, per_page=args.limit)
        return AdminAccountPaginationResponse(
            data=[_admin_account_item(session, account) for account in page.items],
            has_more=page.has_next,
            limit=args.limit,
            page=args.page,
            total=page.total or 0,
        ).model_dump(mode="json"), HTTPStatus.OK

    @console_ns.expect(console_ns.models[AdminAccountCreatePayload.__name__])
    @console_ns.response(HTTPStatus.CREATED, "Success", console_ns.models[AdminAccountCreateResponse.__name__])
    @setup_required
    @admin_required
    @with_session
    def post(self, session: Session):
        args = AdminAccountCreatePayload.model_validate(console_ns.payload or {})
        existing = AccountService.get_account_by_email_with_case_fallback(str(args.email), session=session)
        if existing is not None:
            raise AccountAlreadyExistsError()
        try:
            account, _created = AccountService.ensure_account_for_assignment(
                email=str(args.email),
                name=args.name,
                password=args.password,
                language=args.language or "en-US",
                session=session,
            )
        except AccountPasswordRequiredServiceError as exc:
            raise AccountPasswordRequiredError() from exc
        except ValueError as exc:
            return {"code": "invalid_param", "message": str(exc)}, HTTPStatus.BAD_REQUEST
        return (
            dump_response(
                AdminAccountCreateResponse,
                {"result": "success", "account": _admin_account_item(session, account)},
            ),
            HTTPStatus.CREATED,
        )


@console_ns.route("/all-workspaces/<uuid:workspace_id>/members")
class AdminWorkspaceMembersApi(Resource):
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[AdminMemberListResponse.__name__])
    @setup_required
    @admin_required
    @with_session(write=False)
    def get(self, session: Session, workspace_id: str):
        tenant = TenantService.get_tenant_by_id(str(workspace_id), session=session)
        if tenant is None:
            raise WorkspaceNotFoundError()
        members = TenantService.get_tenant_members(tenant, session=session)
        return AdminMemberListResponse(
            data=[
                {
                    "id": member.id,
                    "name": member.name,
                    "email": member.email,
                    "role": str(member.role),
                    "status": str(member.status),
                }
                for member in members
            ]
        ).model_dump(mode="json"), HTTPStatus.OK

    @console_ns.expect(console_ns.models[AdminMemberAssignPayload.__name__])
    @console_ns.response(HTTPStatus.CREATED, "Success", console_ns.models[AdminMemberAssignResponse.__name__])
    @setup_required
    @admin_required
    @with_session
    def post(self, session: Session, workspace_id: str):
        args = AdminMemberAssignPayload.model_validate(console_ns.payload or {})
        tenant = TenantService.get_tenant_by_id(str(workspace_id), session=session)
        if tenant is None:
            raise WorkspaceNotFoundError()
        try:
            account, join, created_account, added = _assign_member(
                session, tenant, args, operator=None, skip_permission_check=True
            )
        except ValueError as exc:
            return {"code": "invalid_param", "message": str(exc)}, HTTPStatus.BAD_REQUEST
        return (
            dump_response(
                AdminMemberAssignResponse,
                {
                    "result": "success",
                    "created_account": created_account,
                    "added": added,
                    "member": {
                        "id": account.id,
                        "name": account.name,
                        "email": account.email,
                        "role": str(join.role),
                        "status": str(account.status),
                    },
                },
            ),
            HTTPStatus.CREATED,
        )


@console_ns.route("/all-workspaces/<uuid:workspace_id>/members/<uuid:account_id>")
class AdminWorkspaceMemberApi(Resource):
    @console_ns.expect(console_ns.models[AdminMemberRolePayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[AdminMemberAssignResponse.__name__])
    @setup_required
    @admin_required
    @with_session
    def patch(self, session: Session, workspace_id: str, account_id: str):
        args = AdminMemberRolePayload.model_validate(console_ns.payload or {})
        tenant = TenantService.get_tenant_by_id(str(workspace_id), session=session)
        if tenant is None:
            raise WorkspaceNotFoundError()
        account = AccountService.get_account_by_id(str(account_id), session=session)
        if account is None:
            raise AccountNotFoundForAssignmentError()
        try:
            join, added = TenantService.assign_account_to_tenant(
                tenant,
                account,
                args.role,
                None,
                session=session,
                skip_permission_check=True,
            )
        except InvalidActionError as exc:
            raise InvalidMemberRoleError() from exc
        return dump_response(
            AdminMemberAssignResponse,
            {
                "result": "success",
                "created_account": False,
                "added": added,
                "member": {
                    "id": account.id,
                    "name": account.name,
                    "email": account.email,
                    "role": str(join.role),
                    "status": str(account.status),
                },
            },
        )

    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[SimpleResultResponse.__name__])
    @setup_required
    @admin_required
    @with_session
    def delete(self, session: Session, workspace_id: str, account_id: str):
        tenant = TenantService.get_tenant_by_id(str(workspace_id), session=session)
        if tenant is None:
            raise WorkspaceNotFoundError()
        account = AccountService.get_account_by_id(str(account_id), session=session)
        if account is None:
            raise AccountNotFoundForAssignmentError()
        TenantService._detach_membership(tenant, account, session=session, source="admin_member_removed", actor=None)
        return SimpleResultResponse(result="success").model_dump(mode="json")


@console_ns.route("/workspaces/current/summary")
class CurrentWorkspaceSummaryApi(Resource):
    @console_ns.response(
        HTTPStatus.OK,
        "Success",
        console_ns.models[CurrentWorkspaceSummaryResponse.__name__],
    )
    @console_ns.response(HTTPStatus.CONFLICT, "Current workspace is archived")
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_user
    @with_session(write=False)
    def get(self, session: Session, current_user: Account):
        tenant = current_user.current_tenant
        if not tenant:
            raise ValueError("No current tenant")
        if tenant.status == TenantStatus.ARCHIVE:
            raise CurrentWorkspaceArchivedError()

        return (
            dump_response(
                CurrentWorkspaceSummaryResponse,
                WorkspaceService.get_current_workspace_summary(tenant, current_user.id, session=session),
            ),
            HTTPStatus.OK,
        )


@console_ns.route("/workspaces/switch")
class SwitchWorkspaceApi(Resource):
    @console_ns.expect(console_ns.models[SwitchWorkspacePayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[SwitchWorkspaceResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_user
    @with_session
    def post(self, session: Session, current_user: Account):
        payload = console_ns.payload or {}
        args = SwitchWorkspacePayload.model_validate(payload)

        # Check whether the tenant_id belongs to the current account.
        try:
            TenantService.switch_tenant(current_user, args.tenant_id, session=session)
        except Exception:
            raise AccountNotLinkTenantError("Account not link tenant")

        new_tenant = TenantService.get_tenant_by_id(args.tenant_id, session=session)
        if new_tenant is None:
            raise ValueError("Tenant not found")

        return SwitchWorkspaceResponse(
            result="success", new_tenant=WorkspaceService.get_tenant_info(new_tenant, session=session)
        ).model_dump(mode="json")


@console_ns.route("/workspaces/custom-config")
class CustomConfigWorkspaceApi(Resource):
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspaceCustomConfigResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_tenant_id
    @with_session(write=False)
    def get(self, session: Session, current_tenant_id: str):
        tenant = TenantService.get_tenant_by_id(current_tenant_id, session=session)
        if tenant is None:
            raise NotFound()

        custom_config = tenant.custom_config_dict
        replace_webapp_logo = (
            f"{dify_config.FILES_URL}/files/workspaces/{tenant.id}/webapp-logo"
            if custom_config.get("replace_webapp_logo")
            else None
        )
        return dump_response(
            WorkspaceCustomConfigResponse,
            {
                "remove_webapp_brand": custom_config.get("remove_webapp_brand", False),
                "replace_webapp_logo": replace_webapp_logo,
            },
        )

    @console_ns.expect(console_ns.models[WorkspaceCustomConfigPayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspaceTenantResultResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @cloud_edition_billing_resource_check("workspace_custom")
    @with_current_tenant_id
    @with_session
    def post(self, session: Session, current_tenant_id: str):
        payload = console_ns.payload or {}
        args = WorkspaceCustomConfigPayload.model_validate(payload)
        tenant = TenantService.get_tenant_by_id(current_tenant_id, session=session)
        if tenant is None:
            raise NotFound()

        custom_config_dict: TenantCustomConfigDict = {
            "remove_webapp_brand": args.remove_webapp_brand
            if args.remove_webapp_brand is not None
            else tenant.custom_config_dict.get("remove_webapp_brand", False),
            "replace_webapp_logo": args.replace_webapp_logo
            if args.replace_webapp_logo is not None
            else tenant.custom_config_dict.get("replace_webapp_logo"),
        }

        tenant.custom_config_dict = custom_config_dict
        session.commit()

        return WorkspaceTenantResultResponse(
            result="success", tenant=WorkspaceService.get_tenant_info(tenant, session=session)
        ).model_dump(mode="json")


@console_ns.route("/workspaces/custom-config/webapp-logo/upload")
class WebappLogoWorkspaceApi(Resource):
    @console_ns.doc(consumes=["multipart/form-data"], params=WORKSPACE_LOGO_UPLOAD_PARAMS)
    @console_ns.response(HTTPStatus.CREATED, "Logo uploaded", console_ns.models[WorkspaceLogoUploadResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @cloud_edition_billing_resource_check("workspace_custom")
    @with_current_user
    def post(self, current_user: Account):
        # check file
        if "file" not in request.files:
            raise NoFileUploadedError()

        if len(request.files) > 1:
            raise TooManyFilesError()

        # get file from request
        file = request.files["file"]
        if not file.filename:
            raise FilenameNotExistsError

        extension = file.filename.split(".")[-1]
        if extension.lower() not in {"svg", "png"}:
            raise UnsupportedFileTypeError()

        try:
            upload_file = FileService(db.engine).upload_file(
                filename=file.filename,
                content=file.stream.read(),
                mimetype=file.mimetype,
                user=current_user,
            )

        except services.errors.file.FileTooLargeError as file_too_large_error:
            raise FileTooLargeError(file_too_large_error.description)
        except services.errors.file.UnsupportedFileTypeError:
            raise UnsupportedFileTypeError()

        return WorkspaceLogoUploadResponse(id=upload_file.id).model_dump(mode="json"), HTTPStatus.CREATED


@console_ns.route("/workspaces/info")
class WorkspaceInfoApi(Resource):
    @console_ns.expect(console_ns.models[WorkspaceInfoPayload.__name__])
    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspaceTenantResultResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @with_current_user
    @with_session
    def post(self, session: Session, current_user: Account):
        payload = console_ns.payload or {}
        args = WorkspaceInfoPayload.model_validate(payload)

        current_tenant_id = current_user.current_tenant_id
        if not current_tenant_id:
            raise ValueError("No current tenant")
        tenant = TenantService.get_tenant_by_id(current_tenant_id, session=session)
        if tenant is None:
            raise NotFound()
        if not TenantService.is_workspace_owner(current_user, tenant, session=session):
            raise WorkspaceNotOwnerError()
        tenant.name = args.name
        session.commit()

        return WorkspaceTenantResultResponse(
            result="success", tenant=WorkspaceService.get_tenant_info(tenant, session=session)
        ).model_dump(mode="json")


@console_ns.route("/workspaces/current/permission")
class WorkspacePermissionApi(Resource):
    """Get workspace permissions for the current workspace."""

    @console_ns.response(HTTPStatus.OK, "Success", console_ns.models[WorkspacePermissionResponse.__name__])
    @setup_required
    @login_required
    @account_initialization_required
    @only_edition_enterprise
    @with_current_tenant_id
    def get(self, current_tenant_id: str):
        """
        Get workspace permission settings.
        Returns permission flags that control workspace features like member invitations and owner transfer.
        """
        if not current_tenant_id:
            raise ValueError("No current tenant")

        # Get workspace permissions from enterprise service
        permission = EnterpriseService.WorkspacePermissionService.get_permission(current_tenant_id)

        return WorkspacePermissionResponse(
            workspace_id=permission.workspace_id,
            allow_member_invite=permission.allow_member_invite,
            allow_owner_transfer=permission.allow_owner_transfer,
        ).model_dump(mode="json"), HTTPStatus.OK
