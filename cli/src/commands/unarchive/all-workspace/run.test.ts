import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { runUnarchiveAllWorkspace } from './run.js'

describe('runUnarchiveAllWorkspace', () => {
  it('restores the named workspace', async () => {
    const client = { unarchive: vi.fn(() => Promise.resolve({ result: 'success' })) }

    const result = await runUnarchiveAllWorkspace(
      { workspaceId: 'ws-1', yes: true },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.unarchive).toHaveBeenCalledExactlyOnceWith('ws-1')
    expect(result.text()).toMatch(/Restored ws-1/)
  })
})
