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
import { persistActiveWorkspace, workspaceFromDetail } from '@/workspace/persist'
import { resolveWorkspaceId } from '@/workspace/resolver'
import { ArchiveWorkspaceOutput } from './handlers.js'

export type ArchiveWorkspaceOptions = {
  readonly workspaceId?: string
  readonly yes?: boolean
}

export type ArchiveWorkspaceDeps = {
  readonly reg: Registry
  readonly active: ActiveContext
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly envLookup?: (k: string) => string | undefined
  readonly workspacesFactory?: (http: HttpClient) => WorkspacesClient
}

export async function runArchiveWorkspace(
  opts: ArchiveWorkspaceOptions,
  deps: ArchiveWorkspaceDeps,
): Promise<ArchiveWorkspaceOutput> {
  const env = deps.envLookup ?? ((k: string) => process.env[k])
  const factory = deps.workspacesFactory ?? ((h: HttpClient) => new WorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))

  const explicitId = opts.workspaceId?.trim() ?? ''
  const wsId =
    explicitId !== ''
      ? explicitId
      : resolveWorkspaceId({
          env: env('DIFY_WORKSPACE_ID'),
          active: deps.active,
        })

  if (!opts.yes && io.isErrTTY) {
    const confirmed = await promptConfirm(io, `Archive workspace ${wsId}? [y/N] `)
    if (!confirmed) {
      throw new BaseError({
        code: ErrorCode.UsageMissingArg,
        message: 'aborted by user',
        hint: 'pass --yes to skip confirmation',
      })
    }
  }

  const response = await runWithSpinner({ io, label: `Archiving ${wsId}` }, () =>
    factory(deps.http).archive(wsId),
  )

  const next = response.workspace
  await persistActiveWorkspace(deps.reg, deps.active, next ? workspaceFromDetail(next) : undefined)

  const textLine =
    next === undefined || next === null
      ? `${cs.successIcon()} Archived ${wsId}\n`
      : `${cs.successIcon()} Archived ${wsId}; switched to ${next.name} (${next.id})\n`
  return new ArchiveWorkspaceOutput(response, textLine)
}
