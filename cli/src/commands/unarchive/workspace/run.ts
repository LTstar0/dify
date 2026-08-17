import type { ActiveContext, Registry } from '@/auth/hosts'
import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { WorkspacesClient } from '@/api/workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { promptConfirm } from '@/sys/io/prompt'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { UnarchiveWorkspaceOutput } from './handlers.js'

export type UnarchiveWorkspaceOptions = {
  readonly workspaceId: string
  readonly yes?: boolean
}

export type UnarchiveWorkspaceDeps = {
  readonly reg: Registry
  readonly active: ActiveContext
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly workspacesFactory?: (http: HttpClient) => WorkspacesClient
}

export async function runUnarchiveWorkspace(
  opts: UnarchiveWorkspaceOptions,
  deps: UnarchiveWorkspaceDeps,
): Promise<UnarchiveWorkspaceOutput> {
  const workspaceId = opts.workspaceId.trim()
  if (workspaceId === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: 'workspace id is required',
    })
  }

  const factory = deps.workspacesFactory ?? ((h: HttpClient) => new WorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))

  if (!opts.yes && io.isErrTTY) {
    const confirmed = await promptConfirm(io, `Restore workspace ${workspaceId}? [y/N] `)
    if (!confirmed) {
      throw new BaseError({
        code: ErrorCode.UsageMissingArg,
        message: 'aborted by user',
        hint: 'pass --yes to skip confirmation',
      })
    }
  }

  const detail = await runWithSpinner({ io, label: `Restoring ${workspaceId}` }, () =>
    factory(deps.http).unarchive(workspaceId),
  )

  return new UnarchiveWorkspaceOutput(
    detail,
    `${cs.successIcon()} Restored ${detail.name} (${detail.id})\n`,
  )
}
