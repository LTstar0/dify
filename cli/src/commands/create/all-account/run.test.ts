import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { runCreateAllAccount } from './run.js'

describe('runCreateAllAccount', () => {
  it('creates an account', async () => {
    const client = {
      create: vi.fn(() =>
        Promise.resolve({
          result: 'success',
          account: {
            id: 'acct-1',
            name: 'Editor',
            email: 'editor@example.com',
            status: 'active',
            memberships: [],
          },
        }),
      ),
    }

    const result = await runCreateAllAccount(
      { email: ' editor@example.com ', name: ' Editor ', password: 'Passw0rd1' },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.create).toHaveBeenCalledExactlyOnceWith({
      email: 'editor@example.com',
      name: 'Editor',
      password: 'Passw0rd1',
    })
    expect(result.name()).toBe('acct-1')
    expect(result.text()).toMatch(/Created editor@example.com/)
  })
})
