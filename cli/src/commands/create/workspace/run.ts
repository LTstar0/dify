import type { ActiveContext, Registry } from '@/auth/hosts'
import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { WorkspacesClient } from '@/api/workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { persistActiveWorkspace, workspaceFromDetail } from '@/workspace/persist'
import { CreateWorkspaceOutput } from './handlers.js'

export type CreateWorkspaceOptions = {
  readonly name: string
}

export type CreateWorkspaceDeps = {
  readonly reg: Registry
  readonly active: ActiveContext
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly workspacesFactory?: (http: HttpClient) => WorkspacesClient
}

export async function runCreateWorkspace(
  opts: CreateWorkspaceOptions,
  deps: CreateWorkspaceDeps,
): Promise<CreateWorkspaceOutput> {
  const name = opts.name.trim()
  if (name === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: '--name is required',
    })
  }

  const factory = deps.workspacesFactory ?? ((h: HttpClient) => new WorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))

  const detail = await runWithSpinner({ io, label: `Creating ${name}` }, () =>
    factory(deps.http).create({ name }),
  )

  await persistActiveWorkspace(deps.reg, deps.active, workspaceFromDetail(detail))
  return new CreateWorkspaceOutput(
    detail,
    `${cs.successIcon()} Created ${detail.name} (${detail.id})\n`,
  )
}
