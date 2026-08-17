import { describe, expect, it } from 'vitest'
import { parseAssignableTenantRole } from './roles.js'

describe('parseAssignableTenantRole', () => {
  it('accepts assignable roles', () => {
    expect(parseAssignableTenantRole('editor')).toBe('editor')
    expect(parseAssignableTenantRole('admin')).toBe('admin')
  })

  it('rejects owner and unknown roles', () => {
    expect(() => parseAssignableTenantRole('owner')).toThrow(/invalid --role/)
    expect(() => parseAssignableTenantRole('superuser')).toThrow(/invalid --role/)
  })
})
