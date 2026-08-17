from inspect import unwrap
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from flask import Flask

from controllers.console.workspace.error import (
    AccountAlreadyExistsError,
    InvalidMemberRoleError,
    WorkspaceNotFoundError,
)
from controllers.console.workspace.workspace import (
    AdminAccountListApi,
    AdminWorkspaceMemberApi,
    AdminWorkspaceMembersApi,
)
from services.errors.account import InvalidActionError


class TestAdminAccountListApi:
    def test_creates_account(self, app: Flask) -> None:
        api = AdminAccountListApi()
        method = unwrap(api.post)
        account = SimpleNamespace(
            id="acct-1",
            name="Editor",
            email="editor@example.com",
            status="active",
            created_at=None,
        )
        session = SimpleNamespace()

        with (
            app.test_request_context(
                "/",
                json={"email": "editor@example.com", "name": "Editor", "password": "Passw0rd1"},
            ),
            patch(
                "controllers.console.workspace.workspace.AccountService.get_account_by_email_with_case_fallback",
                return_value=None,
            ),
            patch(
                "controllers.console.workspace.workspace.AccountService.ensure_account_for_assignment",
                return_value=(account, True),
            ),
            patch(
                "controllers.console.workspace.workspace._admin_account_item",
                return_value={
                    "id": "acct-1",
                    "name": "Editor",
                    "email": "editor@example.com",
                    "status": "active",
                    "created_at": None,
                    "memberships": [],
                },
            ),
        ):
            result, status = method(api, session)

        assert status == 201
        assert result["account"]["email"] == "editor@example.com"

    def test_rejects_duplicate_email(self, app: Flask) -> None:
        api = AdminAccountListApi()
        method = unwrap(api.post)
        session = SimpleNamespace()

        with (
            app.test_request_context(
                "/",
                json={"email": "owner@example.com", "name": "Owner", "password": "Passw0rd1"},
            ),
            patch(
                "controllers.console.workspace.workspace.AccountService.get_account_by_email_with_case_fallback",
                return_value=SimpleNamespace(id="existing"),
            ),
            pytest.raises(AccountAlreadyExistsError),
        ):
            method(api, session)


class TestAdminWorkspaceMembersApi:
    def test_assigns_member(self, app: Flask) -> None:
        api = AdminWorkspaceMembersApi()
        method = unwrap(api.post)
        tenant = SimpleNamespace(id="ws-1")
        account = SimpleNamespace(id="acct-1", name="Ops", email="ops@example.com", status="active")
        join = SimpleNamespace(role="normal")
        session = SimpleNamespace()

        with (
            app.test_request_context("/", json={"email": "ops@example.com", "role": "normal"}),
            patch(
                "controllers.console.workspace.workspace.TenantService.get_tenant_by_id",
                return_value=tenant,
            ),
            patch(
                "controllers.console.workspace.workspace._assign_member",
                return_value=(account, join, False, True),
            ),
        ):
            result, status = method(api, session, "ws-1")

        assert status == 201
        assert result["added"] is True
        assert result["member"]["role"] == "normal"

    def test_assign_unknown_workspace(self, app: Flask) -> None:
        api = AdminWorkspaceMembersApi()
        method = unwrap(api.post)
        session = SimpleNamespace()

        with (
            app.test_request_context("/", json={"email": "ops@example.com", "role": "normal"}),
            patch(
                "controllers.console.workspace.workspace.TenantService.get_tenant_by_id",
                return_value=None,
            ),
            pytest.raises(WorkspaceNotFoundError),
        ):
            method(api, session, "missing")


class TestAdminWorkspaceMemberApi:
    def test_rejects_owner_role(self, app: Flask) -> None:
        api = AdminWorkspaceMemberApi()
        method = unwrap(api.patch)
        session = SimpleNamespace()

        with (
            app.test_request_context("/", json={"role": "owner"}),
            patch(
                "controllers.console.workspace.workspace.TenantService.get_tenant_by_id",
                return_value=SimpleNamespace(id="ws-1"),
            ),
            patch(
                "controllers.console.workspace.workspace.AccountService.get_account_by_id",
                return_value=SimpleNamespace(id="acct-1"),
            ),
            patch(
                "controllers.console.workspace.workspace.TenantService.assign_account_to_tenant",
                side_effect=InvalidActionError("Invalid role."),
            ),
            pytest.raises(InvalidMemberRoleError),
        ):
            method(api, session, "ws-1", "acct-1")
