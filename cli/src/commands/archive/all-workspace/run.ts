import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { promptConfirm } from '@/sys/io/prompt'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { ArchiveAllWorkspaceOutput } from './handlers.js'

export type ArchiveAllWorkspaceOptions = {
  readonly workspaceId: string
  readonly yes?: boolean
}

export type ArchiveAllWorkspaceDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export async function runArchiveAllWorkspace(
  opts: ArchiveAllWorkspaceOptions,
  deps: ArchiveAllWorkspaceDeps,
): Promise<ArchiveAllWorkspaceOutput> {
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
      `Archive workspace ${workspaceId} as operator? [y/N] `,
    )
    if (!confirmed) {
      throw new BaseError({
        code: ErrorCode.UsageMissingArg,
        message: 'aborted by user',
        hint: 'pass --yes to skip confirmation',
      })
    }
  }

  const response = await runWithSpinner({ io, label: `Archiving ${workspaceId}` }, () =>
    factory(deps.http).archive(workspaceId),
  )
  return new ArchiveAllWorkspaceOutput(response, `${cs.successIcon()} Archived ${workspaceId}\n`)
}
