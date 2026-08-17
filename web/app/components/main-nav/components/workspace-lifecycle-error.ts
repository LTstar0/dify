export type WorkspaceLifecycleErrorCode =
  | 'cannot_archive_last_workspace'
  | 'cannot_leave_last_workspace'
  | 'owner_cannot_leave'
  | 'workspace_already_archived'
  | 'workspace_not_archived'
  | 'workspace_not_found'
  | 'limit_exceeded'

const WORKSPACE_LIFECYCLE_ERROR_CODES = new Set<WorkspaceLifecycleErrorCode>([
  'cannot_archive_last_workspace',
  'cannot_leave_last_workspace',
  'owner_cannot_leave',
  'workspace_already_archived',
  'workspace_not_archived',
  'workspace_not_found',
  'limit_exceeded',
])

function getRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function getWorkspaceLifecycleErrorCode(error: unknown): WorkspaceLifecycleErrorCode | null {
  const errorRecord = getRecord(error)
  const dataRecord = getRecord(errorRecord?.data)
  const bodyRecord = getRecord(dataRecord?.body)
  const code = bodyRecord?.code ?? errorRecord?.code

  return typeof code === 'string' &&
    WORKSPACE_LIFECYCLE_ERROR_CODES.has(code as WorkspaceLifecycleErrorCode)
    ? (code as WorkspaceLifecycleErrorCode)
    : null
}
