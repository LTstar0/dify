import type { WorkspaceDetailResponse } from '@dify/contracts/api/openapi/types.gen'
import type { HttpClient } from '@/http/types'
import { useTempConfigDir } from '@test/fixtures/config-dir'
import { describe, expect, it, vi } from 'vitest'
import { Registry } from '@/auth/hosts'
import { bufferStreams } from '@/sys/io/streams'
import { runUnarchiveWorkspace } from './run.js'

const ARCHIVED_ID = '550e8400-e29b-41d4-a716-446655440009'

function makeRegistry(): Registry {
  const reg = Registry.empty('file')
  reg.upsert('cloud.dify.ai', 'tester@dify.ai', {
    account: { id: 'acct-1', email: 'tester@dify.ai', name: 'Tester' },
    workspace: { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Default', role: 'owner' },
  })
  reg.setHost('cloud.dify.ai')
  reg.setAccount('tester@dify.ai')
  return reg
}

function detail(): WorkspaceDetailResponse {
  return {
    id: ARCHIVED_ID,
    name: 'Restored',
    role: 'owner',
    status: 'normal',
    current: false,
  }
}

describe('runUnarchiveWorkspace', () => {
  useTempConfigDir('difyctl-unarchive-workspace-')

  it('restores the named workspace without changing hosts.yml', async () => {
    const io = bufferStreams()
    const reg = makeRegistry()
    await reg.save()
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active')
    const client = { unarchive: vi.fn(() => Promise.resolve(detail())) }

    const result = await runUnarchiveWorkspace(
      { workspaceId: ARCHIVED_ID, yes: true },
      {
        reg,
        active,
        http: {} as HttpClient,
        io,
        workspacesFactory: () => client as never,
      },
    )

    expect(client.unarchive).toHaveBeenCalledExactlyOnceWith(ARCHIVED_ID)
    expect(result.text()).toMatch(/Restored Restored/)
    expect(result.name()).toBe(ARCHIVED_ID)
    expect((await Registry.load())?.resolveActive()?.ctx.workspace?.id).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('does not persist when restore fails', async () => {
    const client = { unarchive: vi.fn(() => Promise.reject(new Error('limit'))) }
    const reg = makeRegistry()
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active')

    await expect(
      runUnarchiveWorkspace(
        { workspaceId: ARCHIVED_ID, yes: true },
        {
          reg,
          active,
          http: {} as HttpClient,
          io: bufferStreams(),
          workspacesFactory: () => client as never,
        },
      ),
    ).rejects.toThrow('limit')
  })
})
