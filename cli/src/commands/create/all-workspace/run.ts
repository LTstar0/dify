import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { CreateAllWorkspaceOutput } from './handlers.js'

export type CreateAllWorkspaceOptions = {
  readonly name: string
  readonly ownerEmail: string
}

export type CreateAllWorkspaceDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export async function runCreateAllWorkspace(
  opts: CreateAllWorkspaceOptions,
  deps: CreateAllWorkspaceDeps,
): Promise<CreateAllWorkspaceOutput> {
  const name = opts.name.trim()
  const ownerEmail = opts.ownerEmail.trim()
  if (name === '' || ownerEmail === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: '--name and --owner-email are required',
    })
  }

  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllWorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))
  const response = await runWithSpinner({ io, label: `Creating ${name}` }, () =>
    factory(deps.http).create({ name, owner_email: ownerEmail }),
  )
  return new CreateAllWorkspaceOutput(
    response,
    `${cs.successIcon()} Created ${response.tenant.name ?? name} (${response.tenant.id}) for ${ownerEmail}\n`,
  )
}
