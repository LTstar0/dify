import { describe, expect, it } from 'vitest'
import { Registry } from '@/auth/hosts'
import { BaseError } from '@/errors/base'
import { buildAdminContext, resolveAdminApiKey } from './context.js'

describe('resolveAdminApiKey', () => {
  it('returns the trimmed key', () => {
    expect(resolveAdminApiKey((k) => (k === 'DIFY_ADMIN_API_KEY' ? '  secret  ' : undefined))).toBe(
      'secret',
    )
  })

  it('throws when the key is missing', () => {
    expect(() => resolveAdminApiKey(() => undefined)).toThrow(BaseError)
  })
})

describe('buildAdminContext', () => {
  it('uses --host and DIFY_ADMIN_API_KEY without a login', async () => {
    const ctx = await buildAdminContext({
      host: 'https://ops.example.com',
      envLookup: (k) => (k === 'DIFY_ADMIN_API_KEY' ? 'adminkey' : undefined),
    })
    expect(ctx.host).toBe('https://ops.example.com')
    expect(ctx.http.baseURL).toBe('https://ops.example.com/console/api/')
  })

  it('falls back to the active registry host', async () => {
    const reg = Registry.empty('file')
    reg.upsert('https://cloud.dify.ai', 'ops@example.com', {
      account: { id: 'a1', email: 'ops@example.com', name: 'Ops' },
    })
    reg.setHost('https://cloud.dify.ai')
    reg.setAccount('ops@example.com')

    const ctx = await buildAdminContext({
      envLookup: (k) => (k === 'DIFY_ADMIN_API_KEY' ? 'adminkey' : undefined),
      loadRegistry: async () => reg,
    })
    expect(ctx.host).toBe('https://cloud.dify.ai')
  })
})
