from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from werkzeug.wrappers import Response

from models.account import TenantStatus
from services.account_service import TenantService
from services.trigger.trigger_service import TriggerService


def test_is_tenant_archived_when_missing() -> None:
    session = MagicMock()
    session.get.return_value = None
    assert TenantService.is_tenant_archived("missing", session=session) is True


def test_is_tenant_archived_when_archived() -> None:
    session = MagicMock()
    session.get.return_value = SimpleNamespace(status=TenantStatus.ARCHIVE)
    assert TenantService.is_tenant_archived("t1", session=session) is True


def test_is_tenant_archived_when_normal() -> None:
    session = MagicMock()
    session.get.return_value = SimpleNamespace(status=TenantStatus.NORMAL)
    assert TenantService.is_tenant_archived("t1", session=session) is False


def test_process_endpoint_returns_404_for_archived_workspace() -> None:
    subscription = SimpleNamespace(tenant_id="t1", provider_id="p1")
    request = MagicMock()
    with (
        patch(
            "services.trigger.trigger_provider_service.TriggerProviderService.get_subscription_by_endpoint",
            return_value=subscription,
        ),
        patch("services.account_service.TenantService.is_tenant_archived", return_value=True),
    ):
        response = TriggerService.process_endpoint("endpoint-id", request)

    assert isinstance(response, Response)
    assert response.status_code == 404
