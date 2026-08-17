import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { runArchiveAllWorkspace } from './run.js'

describe('runArchiveAllWorkspace', () => {
  it('archives the named workspace', async () => {
    const client = { archive: vi.fn(() => Promise.resolve({ result: 'success', switched: false })) }

    const result = await runArchiveAllWorkspace(
      { workspaceId: 'ws-1', yes: true },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.archive).toHaveBeenCalledExactlyOnceWith('ws-1')
    expect(result.text()).toMatch(/Archived ws-1/)
  })
})
