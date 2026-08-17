from unittest.mock import Mock

import pytest

from enums import DeploymentEdition
from services.entities.feature_entities import LicenseLimitationModel
from services.feature_service import FeatureService


def test_workspace_creation_uses_environment_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.COMMUNITY)
    monkeypatch.setattr("services.feature_service.dify_config.ALLOW_CREATE_WORKSPACE", True)
    monkeypatch.setattr(
        "services.feature_service.EnterpriseService.get_info",
        lambda: (_ for _ in ()).throw(AssertionError("enterprise API should not be called")),
    )

    assert FeatureService.is_workspace_creation_allowed() is True


def test_workspace_creation_uses_enterprise_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.ENTERPRISE)
    monkeypatch.setattr(
        "services.feature_service.EnterpriseService.get_info",
        lambda: {"IsAllowCreateWorkspace": False},
    )

    assert FeatureService.is_workspace_creation_allowed() is False


def test_workspace_creation_keeps_environment_policy_when_enterprise_value_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.ENTERPRISE)
    monkeypatch.setattr("services.feature_service.dify_config.ALLOW_CREATE_WORKSPACE", True)
    monkeypatch.setattr("services.feature_service.EnterpriseService.get_info", lambda: {})

    assert FeatureService.is_workspace_creation_allowed() is True


def test_workspace_creation_policy_community_does_not_call_enterprise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.COMMUNITY)
    monkeypatch.setattr("services.feature_service.dify_config.ALLOW_CREATE_WORKSPACE", True)
    monkeypatch.setattr(
        "services.feature_service.EnterpriseService.get_info",
        lambda: (_ for _ in ()).throw(AssertionError("enterprise API should not be called")),
    )

    is_allowed, workspaces = FeatureService.get_workspace_creation_policy()

    assert is_allowed is True
    assert workspaces == LicenseLimitationModel()
    assert workspaces.is_available() is True


def test_workspace_creation_policy_enterprise_uses_one_get_info(monkeypatch: pytest.MonkeyPatch) -> None:
    get_info = Mock(
        return_value={
            "IsAllowCreateWorkspace": True,
            "License": {
                "status": "active",
                "expiredAt": "2099-01-01",
                "workspaces": {"enabled": True, "limit": 5, "used": 2},
            },
        }
    )
    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.ENTERPRISE)
    monkeypatch.setattr("services.feature_service.EnterpriseService.get_info", get_info)

    is_allowed, workspaces = FeatureService.get_workspace_creation_policy()

    assert is_allowed is True
    assert workspaces.enabled is True
    assert workspaces.limit == 5
    assert workspaces.size == 2
    get_info.assert_called_once()


def test_workspace_creation_policy_enterprise_missing_flag_keeps_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.ENTERPRISE)
    monkeypatch.setattr("services.feature_service.dify_config.ALLOW_CREATE_WORKSPACE", False)
    monkeypatch.setattr("services.feature_service.EnterpriseService.get_info", lambda: {})

    is_allowed, workspaces = FeatureService.get_workspace_creation_policy()

    assert is_allowed is False
    assert workspaces.is_available() is True


def test_plugin_manager_is_enabled_only_for_enterprise(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.ENTERPRISE)
    assert FeatureService.is_plugin_manager_enabled() is True

    monkeypatch.setattr("services.feature_service.dify_config.DEPLOYMENT_EDITION", DeploymentEdition.COMMUNITY)
    assert FeatureService.is_plugin_manager_enabled() is False
