import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { runCreateAllWorkspace } from './run.js'

describe('runCreateAllWorkspace', () => {
  it('creates a workspace for the named owner', async () => {
    const client = {
      create: vi.fn(() =>
        Promise.resolve({
          result: 'success',
          tenant: { id: 'ws-new', name: 'Team', status: 'normal' },
        }),
      ),
    }

    const result = await runCreateAllWorkspace(
      { name: '  Team  ', ownerEmail: ' owner@example.com ' },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.create).toHaveBeenCalledExactlyOnceWith({
      name: 'Team',
      owner_email: 'owner@example.com',
    })
    expect(result.name()).toBe('ws-new')
    expect(result.text()).toMatch(/Created Team/)
  })
})
