import type { WorkspaceLifecycleResponse } from '@dify/contracts/api/openapi/types.gen'
import type { HttpClient } from '@/http/types'
import { useTempConfigDir } from '@test/fixtures/config-dir'
import { describe, expect, it, vi } from 'vitest'
import { Registry } from '@/auth/hosts'
import { bufferStreams } from '@/sys/io/streams'
import { runLeaveWorkspace } from './run.js'

const CURRENT_ID = '550e8400-e29b-41d4-a716-446655440000'
const NEXT_ID = '550e8400-e29b-41d4-a716-446655440002'

function makeRegistry(): Registry {
  const reg = Registry.empty('file')
  reg.upsert('cloud.dify.ai', 'tester@dify.ai', {
    account: { id: 'acct-1', email: 'tester@dify.ai', name: 'Tester' },
    workspace: { id: CURRENT_ID, name: 'Default', role: 'normal' },
  })
  reg.setHost('cloud.dify.ai')
  reg.setAccount('tester@dify.ai')
  return reg
}

function lifecycle(over: Partial<WorkspaceLifecycleResponse> = {}): WorkspaceLifecycleResponse {
  return {
    result: 'success',
    switched: true,
    workspace: {
      id: NEXT_ID,
      name: 'Next',
      role: 'normal',
      status: 'normal',
      current: true,
    },
    ...over,
  }
}

describe('runLeaveWorkspace', () => {
  useTempConfigDir('difyctl-leave-workspace-')

  it('leaves the active workspace and switches hosts.yml to the next one', async () => {
    const io = bufferStreams()
    const reg = makeRegistry()
    await reg.save()
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active')
    const client = { leave: vi.fn(() => Promise.resolve(lifecycle())) }

    const result = await runLeaveWorkspace(
      { yes: true },
      {
        reg,
        active,
        http: {} as HttpClient,
        io,
        workspacesFactory: () => client as never,
      },
    )

    expect(client.leave).toHaveBeenCalledExactlyOnceWith(CURRENT_ID)
    expect(result.text()).toMatch(/switched to Next/)
    expect((await Registry.load())?.resolveActive()?.ctx.workspace?.id).toBe(NEXT_ID)
  })

  it('does not persist when leave fails', async () => {
    const reg = makeRegistry()
    await reg.save()
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active')
    const before = await Registry.load()
    const client = { leave: vi.fn(() => Promise.reject(new Error('owner cannot leave'))) }

    await expect(
      runLeaveWorkspace(
        { yes: true },
        {
          reg,
          active,
          http: {} as HttpClient,
          io: bufferStreams(),
          workspacesFactory: () => client as never,
        },
      ),
    ).rejects.toThrow(/owner cannot leave/)

    expect(await Registry.load()).toEqual(before)
  })
})
