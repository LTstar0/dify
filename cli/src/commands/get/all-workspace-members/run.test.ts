import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { EMPTY_ALL_WORKSPACE_MEMBERS_MESSAGE, runGetAllWorkspaceMembers } from './run.js'

describe('runGetAllWorkspaceMembers', () => {
  it('maps members into table rows', async () => {
    const client = {
      listMembers: vi.fn(() =>
        Promise.resolve({
          data: [
            { id: 'acct-1', name: 'Editor', email: 'e@x.com', role: 'editor', status: 'active' },
          ],
        }),
      ),
    }

    const result = await runGetAllWorkspaceMembers(' ws-1 ', {
      http: {} as HttpClient,
      io: bufferStreams(),
      clientFactory: () => client as never,
    })

    expect(client.listMembers).toHaveBeenCalledExactlyOnceWith('ws-1')
    expect(result.kind).toBe('output')
    if (result.kind !== 'output') return
    expect(result.data.rows[0]?.role).toBe('editor')
  })

  it('returns the empty message when the workspace has no members', async () => {
    const result = await runGetAllWorkspaceMembers('ws-1', {
      http: {} as HttpClient,
      io: bufferStreams(),
      clientFactory: () => ({ listMembers: vi.fn(() => Promise.resolve({ data: [] })) }) as never,
    })
    expect(result).toEqual({ kind: 'empty', message: EMPTY_ALL_WORKSPACE_MEMBERS_MESSAGE })
  })
})
