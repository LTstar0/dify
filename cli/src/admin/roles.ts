import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'

export const ASSIGNABLE_TENANT_ROLES = ['normal', 'admin', 'editor', 'dataset_operator'] as const
export type AssignableTenantRole = (typeof ASSIGNABLE_TENANT_ROLES)[number]

export function parseAssignableTenantRole(role: string): AssignableTenantRole {
  if ((ASSIGNABLE_TENANT_ROLES as readonly string[]).includes(role))
    return role as AssignableTenantRole
  throw new BaseError({
    code: ErrorCode.UsageInvalidFlag,
    message: `invalid --role "${role}"`,
    hint: 'expected: normal | admin | editor | dataset_operator',
  })
}
