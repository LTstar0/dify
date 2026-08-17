from services.errors.base import BaseServiceError


class WorkSpaceNotAllowedCreateError(BaseServiceError):
    pass


class WorkSpaceNotFoundError(BaseServiceError):
    pass


class WorkspacesLimitExceededError(BaseServiceError):
    pass


class WorkspaceAlreadyArchivedError(BaseServiceError):
    pass


class WorkspaceNotArchivedError(BaseServiceError):
    pass


class CannotArchiveLastWorkspaceError(BaseServiceError):
    pass


class CannotLeaveLastWorkspaceError(BaseServiceError):
    pass


class OwnerCannotLeaveError(BaseServiceError):
    pass
