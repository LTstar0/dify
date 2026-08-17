import type { WorkspaceDetailResponse } from '@dify/contracts/api/openapi/types.gen'
import type { HttpClient } from '@/http/types'
import { useTempConfigDir } from '@test/fixtures/config-dir'
import { describe, expect, it, vi } from 'vitest'
import { Registry } from '@/auth/hosts'
import { bufferStreams } from '@/sys/io/streams'
import { runCreateWorkspace } from './run.js'

function makeRegistry(): Registry {
  const reg = Registry.empty('file')
  reg.upsert('cloud.dify.ai', 'tester@dify.ai', {
    account: { id: 'acct-1', email: 'tester@dify.ai', name: 'Tester' },
    workspace: { id: 'ws-1', name: 'Default', role: 'owner' },
  })
  reg.setHost('cloud.dify.ai')
  reg.setAccount('tester@dify.ai')
  return reg
}

function makeDetail(): WorkspaceDetailResponse {
  return {
    id: '00000000-0000-0000-0000-000000000099',
    name: 'Ops Space',
    role: 'owner',
    status: 'normal',
    current: true,
    created_at: '2026-05-18T00:00:00Z',
  }
}

describe('runCreateWorkspace', () => {
  useTempConfigDir('difyctl-create-workspace-')

  it('creates, persists the new active workspace, and returns formatted output', async () => {
    const io = bufferStreams()
    const reg = makeRegistry()
    await reg.save()
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active')
    const client = { create: vi.fn(() => Promise.resolve(makeDetail())) }

    const result = await runCreateWorkspace(
      { name: '  Ops Space  ' },
      {
        reg,
        active,
        http: {} as HttpClient,
        io,
        workspacesFactory: () => client as never,
      },
    )

    expect(client.create).toHaveBeenCalledExactlyOnceWith({ name: 'Ops Space' })
    expect(result.name()).toBe('00000000-0000-0000-0000-000000000099')
    expect(result.text()).toMatch(/Created Ops Space/)
    expect(result.json()).toMatchObject({
      id: '00000000-0000-0000-0000-000000000099',
      current: true,
    })
    expect((await Registry.load())?.resolveActive()?.ctx.workspace).toEqual({
      id: '00000000-0000-0000-0000-000000000099',
      name: 'Ops Space',
      role: 'owner',
    })
  })

  it('rejects a blank name before any HTTP call', async () => {
    const client = { create: vi.fn() }
    const reg = makeRegistry()
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active')

    await expect(
      runCreateWorkspace(
        { name: '   ' },
        {
          reg,
          active,
          http: {} as HttpClient,
          io: bufferStreams(),
          workspacesFactory: () => client as never,
        },
      ),
    ).rejects.toThrow(/--name is required/)
    expect(client.create).not.toHaveBeenCalled()
  })

  it('does not persist when create fails', async () => {
    const reg = makeRegistry()
    await reg.save()
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active')
    const before = await Registry.load()
    const client = { create: vi.fn(() => Promise.reject(new Error('limit exceeded'))) }

    await expect(
      runCreateWorkspace(
        { name: 'Overflow' },
        {
          reg,
          active,
          http: {} as HttpClient,
          io: bufferStreams(),
          workspacesFactory: () => client as never,
        },
      ),
    ).rejects.toThrow(/limit exceeded/)

    expect(await Registry.load()).toEqual(before)
  })
})
