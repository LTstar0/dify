import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllAccountsClient } from '@/api/all-accounts'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { colorEnabled, colorScheme } from '@/sys/io/color'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { CreateAllAccountOutput } from './handlers.js'

export type CreateAllAccountOptions = {
  readonly email: string
  readonly name: string
  readonly password: string
}

export type CreateAllAccountDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllAccountsClient
}

export async function runCreateAllAccount(
  opts: CreateAllAccountOptions,
  deps: CreateAllAccountDeps,
): Promise<CreateAllAccountOutput> {
  const email = opts.email.trim()
  const name = opts.name.trim()
  const password = opts.password
  if (email === '' || name === '' || password === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: '--email, --name, and --password are required',
    })
  }

  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllAccountsClient(h))
  const io = deps.io ?? nullStreams()
  const cs = colorScheme(colorEnabled(io.isErrTTY))
  const response = await runWithSpinner({ io, label: `Creating ${email}` }, () =>
    factory(deps.http).create({ email, name, password }),
  )
  return new CreateAllAccountOutput(
    response,
    `${cs.successIcon()} Created ${response.account.email} (${response.account.id})\n`,
  )
}
