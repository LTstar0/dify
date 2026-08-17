import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { parseAssignableTenantRole } from '@/admin/roles'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { SetAllWorkspaceMemberOutput } from './handlers.js'

export type SetAllWorkspaceMemberOptions = {
  readonly workspaceId: string
  readonly memberId: string
  readonly role: string
}

export type SetAllWorkspaceMemberDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export async function runSetAllWorkspaceMember(
  opts: SetAllWorkspaceMemberOptions,
  deps: SetAllWorkspaceMemberDeps,
): Promise<SetAllWorkspaceMemberOutput> {
  const workspaceId = opts.workspaceId.trim()
  const memberId = opts.memberId.trim()
  if (workspaceId === '' || memberId === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: 'workspace id and member id are required',
    })
  }
  const role = parseAssignableTenantRole(opts.role)
  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllWorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))
  await runWithSpinner({ io, label: `Updating ${memberId}` }, () =>
    factory(deps.http).updateMemberRole(workspaceId, memberId, { role }),
  )
  return new SetAllWorkspaceMemberOutput(
    memberId,
    role,
    `${cs.successIcon()} Set ${memberId} role to ${role}\n`,
  )
}
