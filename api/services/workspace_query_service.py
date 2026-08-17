"""Application service for listing workspaces visible to a Console account."""

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import NamedTuple, Protocol

from enums import CloudPlan
from machinery.context import RequestContext


class WorkspacePlanGateway(Protocol):
    def resolve_many(self, workspace_ids: Sequence[str]) -> Mapping[str, str]: ...


class WorkspaceRecord(NamedTuple):
    id: str
    name: str | None
    status: str
    created_at: datetime
    last_opened_at: datetime | None
    role: str | None = None


class WorkspaceQuery(Protocol):
    def list_for_account(self, account_id: str) -> Sequence[WorkspaceRecord]: ...

    def list_archived_for_account(self, account_id: str) -> Sequence[WorkspaceRecord]: ...


class WorkspaceSummary(NamedTuple):
    id: str
    name: str | None
    plan: str
    status: str
    created_at: datetime
    last_opened_at: datetime | None
    current: bool
    role: str | None = None
    is_owner: bool = False


class WorkspaceQueryService:
    def __init__(
        self,
        *,
        workspaces: WorkspaceQuery,
        plans: WorkspacePlanGateway,
    ) -> None:
        self._workspaces = workspaces
        self._plans = plans

    def list_for_account(self, context: RequestContext) -> tuple[WorkspaceSummary, ...]:
        return self._summaries(context, self._workspaces.list_for_account(context.account_id))

    def list_archived_for_account(self, context: RequestContext) -> tuple[WorkspaceSummary, ...]:
        return self._summaries(context, self._workspaces.list_archived_for_account(context.account_id))

    def _summaries(
        self, context: RequestContext, records: Sequence[WorkspaceRecord]
    ) -> tuple[WorkspaceSummary, ...]:
        # The repository closes its read Session before plan resolution
        # performs Billing/Feature I/O.
        materialised = tuple(records)
        plans = self._plans.resolve_many([record.id for record in materialised])

        return tuple(
            WorkspaceSummary(
                id=record.id,
                name=record.name,
                plan=plans.get(record.id, CloudPlan.SANDBOX),
                status=record.status,
                created_at=record.created_at,
                last_opened_at=record.last_opened_at,
                current=record.id == context.active_workspace_id,
                role=record.role,
                is_owner=False,
            )
            for record in materialised
        )
