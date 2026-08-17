import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { runDeleteAllWorkspaceMember } from './run.js'

describe('runDeleteAllWorkspaceMember', () => {
  it('removes the member', async () => {
    const client = {
      removeMember: vi.fn(() => Promise.resolve({ result: 'success' })),
    }

    const result = await runDeleteAllWorkspaceMember(
      { workspaceId: ' ws-1 ', memberId: ' acct-1 ', yes: true },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.removeMember).toHaveBeenCalledExactlyOnceWith('ws-1', 'acct-1')
    expect(result.name()).toBe('acct-1')
  })
})
