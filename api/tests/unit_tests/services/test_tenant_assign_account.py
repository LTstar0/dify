from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from models.account import Account, AccountStatus, Tenant, TenantAccountRole
from services.account_service import AccountService, TenantService
from services.errors.account import AccountPasswordRequiredError, InvalidActionError


def _account(*, email: str, name: str = "User") -> Account:
    return Account(
        name=name,
        email=email,
        password="hashed",
        password_salt="salt",
        interface_language="en-US",
        status=AccountStatus.ACTIVE,
    )


def test_assign_account_to_tenant_adds_and_updates_role(sqlite_session: Session) -> None:
    tenant = Tenant(name="Ops")
    account = _account(email="member@example.com")
    sqlite_session.add_all([tenant, account])
    sqlite_session.commit()

    join, added = TenantService.assign_account_to_tenant(
        tenant,
        account,
        "editor",
        None,
        session=sqlite_session,
        skip_permission_check=True,
    )
    assert added is True
    assert join.role == TenantAccountRole.EDITOR

    join, added = TenantService.assign_account_to_tenant(
        tenant,
        account,
        "admin",
        None,
        session=sqlite_session,
        skip_permission_check=True,
    )
    assert added is False
    assert join.role == TenantAccountRole.ADMIN


def test_assign_account_to_tenant_rejects_owner_role(sqlite_session: Session) -> None:
    tenant = Tenant(name="Ops")
    account = _account(email="member@example.com")
    sqlite_session.add_all([tenant, account])
    sqlite_session.commit()

    with pytest.raises(InvalidActionError):
        TenantService.assign_account_to_tenant(
            tenant,
            account,
            "owner",
            None,
            session=sqlite_session,
            skip_permission_check=True,
        )


def test_ensure_account_for_assignment_requires_password_for_new_account(sqlite_session: Session) -> None:
    with pytest.raises(AccountPasswordRequiredError):
        AccountService.ensure_account_for_assignment(
            email="new@example.com",
            name="New",
            password=None,
            language="en-US",
            session=sqlite_session,
        )


def test_ensure_account_for_assignment_creates_initialized_account(sqlite_session: Session) -> None:
    with patch("services.account_service.FeatureService") as features:
        features.get_system_features.return_value.is_allow_register = False
        features.get_license.return_value.seats.is_available.return_value = True
        account, created = AccountService.ensure_account_for_assignment(
            email="New.User@example.com",
            name="New User",
            password="Passw0rd1",
            language="en-US",
            session=sqlite_session,
        )

    assert created is True
    assert account.email == "new.user@example.com"
    assert account.status == AccountStatus.ACTIVE
    assert account.initialized_at is not None
    assert account.password is not None


def test_ensure_account_for_assignment_returns_existing(sqlite_session: Session) -> None:
    existing = _account(email="old@example.com", name="Old")
    sqlite_session.add(existing)
    sqlite_session.commit()

    account, created = AccountService.ensure_account_for_assignment(
        email="old@example.com",
        name="Ignored",
        password=None,
        language="en-US",
        session=sqlite_session,
    )
    assert created is False
    assert account.id == existing.id
