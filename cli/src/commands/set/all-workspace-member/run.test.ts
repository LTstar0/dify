import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { runSetAllWorkspaceMember } from './run.js'

describe('runSetAllWorkspaceMember', () => {
  it('updates the member role', async () => {
    const client = {
      updateMemberRole: vi.fn(() => Promise.resolve({ result: 'success' })),
    }

    const result = await runSetAllWorkspaceMember(
      { workspaceId: ' ws-1 ', memberId: ' acct-1 ', role: 'admin' },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.updateMemberRole).toHaveBeenCalledExactlyOnceWith('ws-1', 'acct-1', {
      role: 'admin',
    })
    expect(result.name()).toBe('acct-1')
  })
})
