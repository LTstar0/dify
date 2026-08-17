import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { EMPTY_ALL_ACCOUNTS_MESSAGE, runGetAllAccounts } from './run.js'

describe('runGetAllAccounts', () => {
  it('maps the admin list into table rows', async () => {
    const client = {
      list: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              id: 'acct-1',
              name: 'Ops',
              email: 'ops@example.com',
              status: 'active',
              memberships: [
                { tenant_id: 'ws-1', tenant_name: 'Ops', role: 'admin', status: 'normal' },
              ],
            },
          ],
          has_more: false,
          limit: 20,
          page: 1,
          total: 1,
        }),
      ),
    }

    const result = await runGetAllAccounts(
      { keyword: 'ops' },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.list).toHaveBeenCalledExactlyOnceWith({
      keyword: 'ops',
      page: undefined,
      limit: undefined,
    })
    expect(result.kind).toBe('output')
    if (result.kind !== 'output') return
    expect(result.data.rows[0]?.email).toBe('ops@example.com')
    expect(result.data.rows[0]?.workspaceCount).toBe(1)
  })

  it('returns the empty message when nothing matches', async () => {
    const result = await runGetAllAccounts(
      {},
      {
        http: {} as HttpClient,
        io: bufferStreams(),
        clientFactory: () =>
          ({
            list: vi.fn(() =>
              Promise.resolve({ data: [], has_more: false, limit: 20, page: 1, total: 0 }),
            ),
          }) as never,
      },
    )
    expect(result).toEqual({ kind: 'empty', message: EMPTY_ALL_ACCOUNTS_MESSAGE })
  })
})
