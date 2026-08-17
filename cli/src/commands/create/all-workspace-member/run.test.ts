import type { HttpClient } from '@/http/types'
import { describe, expect, it, vi } from 'vitest'
import { bufferStreams } from '@/sys/io/streams'
import { runCreateAllWorkspaceMember } from './run.js'

describe('runCreateAllWorkspaceMember', () => {
  it('assigns an account to a workspace', async () => {
    const client = {
      assignMember: vi.fn(() =>
        Promise.resolve({
          result: 'success',
          created_account: true,
          added: true,
          member: {
            id: 'acct-1',
            name: 'Editor',
            email: 'editor@example.com',
            role: 'editor',
            status: 'active',
          },
        }),
      ),
    }

    const result = await runCreateAllWorkspaceMember(
      {
        workspaceId: ' ws-1 ',
        email: ' editor@example.com ',
        role: 'editor',
        password: 'Passw0rd1',
      },
      { http: {} as HttpClient, io: bufferStreams(), clientFactory: () => client as never },
    )

    expect(client.assignMember).toHaveBeenCalledExactlyOnceWith('ws-1', {
      email: 'editor@example.com',
      role: 'editor',
      name: undefined,
      password: 'Passw0rd1',
    })
    expect(result.name()).toBe('acct-1')
    expect(result.text()).toMatch(/Assigned editor@example.com as editor/)
  })
})
