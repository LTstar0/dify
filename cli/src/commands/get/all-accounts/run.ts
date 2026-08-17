import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllAccountsClient } from '@/api/all-accounts'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { AllAccountListOutput, AllAccountRow } from './handlers.js'

export const EMPTY_ALL_ACCOUNTS_MESSAGE = 'No accounts match the current filters.\n'

export type GetAllAccountsOptions = {
  readonly keyword?: string
  readonly page?: number
  readonly limit?: number
}

export type GetAllAccountsDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllAccountsClient
}

export type GetAllAccountsResult =
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'output'; readonly data: AllAccountListOutput }

export async function runGetAllAccounts(
  opts: GetAllAccountsOptions,
  deps: GetAllAccountsDeps,
): Promise<GetAllAccountsResult> {
  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllAccountsClient(h))
  const io = deps.io ?? nullStreams()
  const envelope = await runWithSpinner({ io, label: 'Fetching all accounts' }, () =>
    factory(deps.http).list({
      keyword: opts.keyword,
      page: opts.page,
      limit: opts.limit,
    }),
  )
  if (envelope.data.length === 0) return { kind: 'empty', message: EMPTY_ALL_ACCOUNTS_MESSAGE }
  return {
    kind: 'output',
    data: new AllAccountListOutput(
      envelope.data.map(
        (account) =>
          new AllAccountRow(
            account.id,
            account.email,
            account.name,
            account.status,
            account.memberships.length,
          ),
      ),
      envelope,
    ),
  }
}
