import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { promptConfirm } from '@/sys/io/prompt'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { UnarchiveAllWorkspaceOutput } from './handlers.js'

export type UnarchiveAllWorkspaceOptions = {
  readonly workspaceId: string
  readonly yes?: boolean
}

export type UnarchiveAllWorkspaceDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export async function runUnarchiveAllWorkspace(
  opts: UnarchiveAllWorkspaceOptions,
  deps: UnarchiveAllWorkspaceDeps,
): Promise<UnarchiveAllWorkspaceOutput> {
  const workspaceId = opts.workspaceId.trim()
  if (workspaceId === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: 'workspace id is required',
    })
  }

  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllWorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))

  if (!opts.yes && io.isErrTTY) {
    const confirmed = await promptConfirm(
      io,
      `Restore workspace ${workspaceId} as operator? [y/N] `,
    )
    if (!confirmed) {
      throw new BaseError({
        code: ErrorCode.UsageMissingArg,
        message: 'aborted by user',
        hint: 'pass --yes to skip confirmation',
      })
    }
  }

  const response = await runWithSpinner({ io, label: `Restoring ${workspaceId}` }, () =>
    factory(deps.http).unarchive(workspaceId),
  )
  return new UnarchiveAllWorkspaceOutput(response, `${cs.successIcon()} Restored ${workspaceId}\n`)
}
