import { useTempConfigDir } from '@test/fixtures/config-dir'
import { describe, expect, it } from 'vitest'
import { Registry } from '@/auth/hosts'
import { persistActiveWorkspace, workspaceFromDetail } from './persist.js'

describe('persistActiveWorkspace', () => {
  useTempConfigDir('difyctl-persist-workspace-')

  it('writes the new workspace and can clear it', async () => {
    const reg = Registry.empty('file')
    reg.upsert('cloud.dify.ai', 'tester@dify.ai', {
      account: { id: 'acct-1', email: 'tester@dify.ai', name: 'Tester' },
      workspace: { id: 'ws-1', name: 'Default', role: 'owner' },
    })
    reg.setHost('cloud.dify.ai')
    reg.setAccount('tester@dify.ai')
    const active = reg.resolveActive()
    if (active === undefined) throw new Error('missing active context')

    await persistActiveWorkspace(
      reg,
      active,
      workspaceFromDetail({
        id: 'ws-2',
        name: 'Two',
        role: 'admin',
        status: 'normal',
        current: true,
      }),
    )

    expect((await Registry.load())?.resolveActive()?.ctx.workspace).toEqual({
      id: 'ws-2',
      name: 'Two',
      role: 'admin',
    })

    const nextActive = (await Registry.load())?.resolveActive()
    if (nextActive === undefined) throw new Error('missing reloaded context')
    const reloaded = await Registry.load()
    if (reloaded === undefined) throw new Error('missing registry')
    await persistActiveWorkspace(reloaded, nextActive, undefined)
    expect((await Registry.load())?.resolveActive()?.ctx.workspace).toBeUndefined()
  })
})
