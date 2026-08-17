export type CreateWorkspaceErrorCode = 'not_allowed_create_workspace' | 'limit_exceeded'

const CREATE_WORKSPACE_ERROR_CODES = new Set<CreateWorkspaceErrorCode>([
  'not_allowed_create_workspace',
  'limit_exceeded',
])

function getRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function getCreateWorkspaceErrorCode(error: unknown): CreateWorkspaceErrorCode | null {
  const errorRecord = getRecord(error)
  const dataRecord = getRecord(errorRecord?.data)
  const bodyRecord = getRecord(dataRecord?.body)
  const code = bodyRecord?.code ?? errorRecord?.code

  return typeof code === 'string' &&
    CREATE_WORKSPACE_ERROR_CODES.has(code as CreateWorkspaceErrorCode)
    ? (code as CreateWorkspaceErrorCode)
    : null
}

export function canCreateFromWorkspacePolicy(policy: {
  is_allow_create_workspace: boolean
  workspaces: { enabled: boolean; limit: number; size: number }
}): { visible: boolean; enabled: boolean } {
  if (!policy.is_allow_create_workspace) return { visible: false, enabled: false }

  const { enabled, limit, size } = policy.workspaces
  return {
    visible: true,
    enabled: !enabled || limit === 0 || size < limit,
  }
}
