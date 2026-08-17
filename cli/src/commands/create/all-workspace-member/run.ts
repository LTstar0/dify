import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { parseAssignableTenantRole } from '@/admin/roles'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { CreateAllWorkspaceMemberOutput } from './handlers.js'

export type CreateAllWorkspaceMemberOptions = {
  readonly workspaceId: string
  readonly email: string
  readonly role: string
  readonly name?: string
  readonly password?: string
}

export type CreateAllWorkspaceMemberDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export async function runCreateAllWorkspaceMember(
  opts: CreateAllWorkspaceMemberOptions,
  deps: CreateAllWorkspaceMemberDeps,
): Promise<CreateAllWorkspaceMemberOutput> {
  const workspaceId = opts.workspaceId.trim()
  const email = opts.email.trim()
  if (workspaceId === '' || email === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: '--workspace and --email are required',
    })
  }
  const role = parseAssignableTenantRole(opts.role)
  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllWorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))
  const response = await runWithSpinner({ io, label: `Assigning ${email}` }, () =>
    factory(deps.http).assignMember(workspaceId, {
      email,
      role,
      name: opts.name?.trim() || undefined,
      password: opts.password || undefined,
    }),
  )
  return new CreateAllWorkspaceMemberOutput(
    response,
    `${cs.successIcon()} Assigned ${response.member.email} as ${response.member.role} in ${workspaceId}\n`,
  )
}
