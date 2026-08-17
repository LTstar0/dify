import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { Registry } from '@/auth/hosts'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { createHttpClient } from '@/http/client'
import { nullStreams } from '@/sys/io/streams'
import { activeHostInfo, consoleBase, resolveHost } from '@/util/host'

export type AdminContextOptions = {
  readonly host?: string
  readonly insecure?: boolean
  readonly retryAttempts?: number
  readonly io?: IOStreams
  readonly envLookup?: (k: string) => string | undefined
  readonly loadRegistry?: () => Promise<Registry>
}

export type AdminContext = {
  readonly host: string
  readonly http: HttpClient
  readonly io: IOStreams
}

export function resolveAdminApiKey(envLookup: (k: string) => string | undefined): string {
  const key = envLookup('DIFY_ADMIN_API_KEY')?.trim() ?? ''
  if (key === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: 'DIFY_ADMIN_API_KEY is required',
      hint: 'set DIFY_ADMIN_API_KEY to the instance ADMIN_API_KEY',
    })
  }
  return key
}

export async function buildAdminContext(opts: AdminContextOptions = {}): Promise<AdminContext> {
  const env = opts.envLookup ?? ((k: string) => process.env[k])
  const key = resolveAdminApiKey(env)
  const io = opts.io ?? nullStreams()
  const hostFlag = opts.host?.trim() || env('DIFY_HOST')?.trim() || ''
  let host: string
  let insecure = opts.insecure === true

  if (hostFlag !== '') {
    host = resolveHost({ raw: hostFlag, insecure })
  } else {
    const load = opts.loadRegistry ?? (() => Registry.load())
    const active = (await load()).resolveActive()
    if (active === undefined) {
      throw new BaseError({
        code: ErrorCode.UsageMissingArg,
        message: 'host is required',
        hint: 'pass --host, set DIFY_HOST, or run difyctl auth login',
      })
    }
    const info = activeHostInfo(active)
    host = info.host
    insecure = insecure || info.insecure
  }

  return {
    host,
    io,
    http: createHttpClient({
      baseURL: consoleBase(host),
      bearer: key,
      retryAttempts: opts.retryAttempts,
      insecure,
    }),
  }
}
