import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { promptConfirm } from '@/sys/io/prompt'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { DeleteAllWorkspaceMemberOutput } from './handlers.js'

export type DeleteAllWorkspaceMemberOptions = {
  readonly workspaceId: string
  readonly memberId: string
  readonly yes?: boolean
}

export type DeleteAllWorkspaceMemberDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export async function runDeleteAllWorkspaceMember(
  opts: DeleteAllWorkspaceMemberOptions,
  deps: DeleteAllWorkspaceMemberDeps,
): Promise<DeleteAllWorkspaceMemberOutput> {
  const workspaceId = opts.workspaceId.trim()
  const memberId = opts.memberId.trim()
  if (workspaceId === '' || memberId === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: 'workspace id and member id are required',
    })
  }

  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllWorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))

  if (!opts.yes && io.isErrTTY) {
    const confirmed = await promptConfirm(io, `Remove member ${memberId}? [y/N] `)
    if (!confirmed) {
      throw new BaseError({
        code: ErrorCode.UsageMissingArg,
        message: 'aborted by user',
        hint: 'pass --yes to skip confirmation',
      })
    }
  }

  await runWithSpinner({ io, label: `Removing ${memberId}` }, () =>
    factory(deps.http).removeMember(workspaceId, memberId),
  )
  return new DeleteAllWorkspaceMemberOutput(memberId, `${cs.successIcon()} Removed ${memberId}\n`)
}
