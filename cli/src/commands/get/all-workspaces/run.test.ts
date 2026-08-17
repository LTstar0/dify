import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { EMPTY_ALL_WORKSPACES_MESSAGE, runGetAllWorkspaces } from './run.js'

describe('runGetAllWorkspaces', () => {
  it('maps the admin list into table rows', async () => {
    const client = {
      list: vi.fn(() =>
        Promise.resolve({
          data: [{ id: 'ws-1', name: 'Ops', status: 'normal', member_count: 2, created_at: 1 }],
          has_more: false,
          limit: 20,
          page: 1,
          total: 1,
        }),
      ),
    }

    const result = await runGetAllWorkspaces(
      { keyword: 'Ops', status: 'normal' },
      {
        http: {} as HttpClient,
        io: bufferStreams(),
        clientFactory: () => client as never,
      },
    )

    expect(client.list).toHaveBeenCalledExactlyOnceWith({
      keyword: 'Ops',
      status: 'normal',
      page: undefined,
      limit: undefined,
    })
    expect(result.kind).toBe('output')
    if (result.kind !== 'output') return
    expect(result.data.rows[0]?.id).toBe('ws-1')
    expect(result.data.rows[0]?.memberCount).toBe(2)
  })

  it('returns the empty message when nothing matches', async () => {
    const result = await runGetAllWorkspaces(
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
    expect(result).toEqual({ kind: 'empty', message: EMPTY_ALL_WORKSPACES_MESSAGE })
  })
})
