from libs.exception import BaseHTTPException


class CurrentWorkspaceArchivedError(BaseHTTPException):
    error_code = "current_workspace_archived"
    description = "The current workspace has been archived."
    code = 409


class RepeatPasswordNotMatchError(BaseHTTPException):
    error_code = "repeat_password_not_match"
    description = "New password and repeat password does not match."
    code = 400


class CurrentPasswordIncorrectError(BaseHTTPException):
    error_code = "current_password_incorrect"
    description = "Current password is incorrect."
    code = 400


class InvalidInvitationCodeError(BaseHTTPException):
    error_code = "invalid_invitation_code"
    description = "Invalid invitation code."
    code = 400


class AccountAlreadyInitedError(BaseHTTPException):
    error_code = "account_already_inited"
    description = "The account has been initialized. Please refresh the page."
    code = 400


class AccountNotInitializedError(BaseHTTPException):
    error_code = "account_not_initialized"
    description = "The account has not been initialized yet. Please proceed with the initialization process first."
    code = 400


class InvalidAccountDeletionCodeError(BaseHTTPException):
    error_code = "invalid_account_deletion_code"
    description = "Invalid account deletion code."
    code = 400


class InvalidMemberRoleError(BaseHTTPException):
    error_code = "invalid_role"
    description = "Invalid role."
    code = 400


class WorkspaceNotOwnerError(BaseHTTPException):
    error_code = "not_owner"
    description = "You are not the owner of the workspace."
    code = 403


class WorkspaceAlreadyArchivedError(BaseHTTPException):
    error_code = "workspace_already_archived"
    description = "The workspace is already archived."
    code = 409


class WorkspaceNotArchivedError(BaseHTTPException):
    error_code = "workspace_not_archived"
    description = "The workspace is not archived."
    code = 409


class CannotArchiveLastWorkspaceError(BaseHTTPException):
    error_code = "cannot_archive_last_workspace"
    description = "Cannot archive this workspace because at least one member has no other active workspace."
    code = 400


class CannotLeaveLastWorkspaceError(BaseHTTPException):
    error_code = "cannot_leave_last_workspace"
    description = "Cannot leave the last remaining workspace."
    code = 400


class OwnerCannotLeaveError(BaseHTTPException):
    error_code = "owner_cannot_leave"
    description = "The workspace owner cannot leave. Transfer ownership first."
    code = 400


class WorkspaceNotFoundError(BaseHTTPException):
    error_code = "workspace_not_found"
    description = "Workspace not found."
    code = 404


class OwnerAccountNotFoundError(BaseHTTPException):
    error_code = "owner_account_not_found"
    description = "Owner account not found."
    code = 404


class AccountPasswordRequiredError(BaseHTTPException):
    error_code = "account_password_required"
    description = "Password is required to create a new account."
    code = 400


class AccountNotFoundForAssignmentError(BaseHTTPException):
    error_code = "account_not_found"
    description = "Account not found."
    code = 404


class AccountAlreadyExistsError(BaseHTTPException):
    error_code = "account_already_exists"
    description = "An account with this email already exists."
    code = 409
