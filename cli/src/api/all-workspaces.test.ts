import type { StubServer } from '@test/fixtures/stub-server'
import { jsonResponder, startStubServer } from '@test/fixtures/stub-server'
import { afterEach, describe, expect, it } from 'vitest'
import { createHttpClient } from '@/http/client'
import { consoleBase } from '@/util/host'
import { AllWorkspacesClient } from './all-workspaces.js'

function makeClient(host: string): AllWorkspacesClient {
  return new AllWorkspacesClient(
    createHttpClient({ baseURL: consoleBase(host), bearer: 'admin-key' }),
  )
}

describe('AllWorkspacesClient', () => {
  let stub: StubServer

  afterEach(async () => {
    await stub?.stop()
  })

  it('GETs /all-workspaces with filters', async () => {
    stub = await startStubServer((cap) =>
      jsonResponder(
        200,
        {
          data: [{ id: 'ws-1', name: 'Ops', status: 'normal', member_count: 3, created_at: 1 }],
          has_more: false,
          limit: 20,
          page: 1,
          total: 1,
        },
        cap,
      ),
    )

    const res = await makeClient(stub.url).list({
      keyword: 'Ops',
      status: 'normal',
      page: 1,
      limit: 20,
    })

    expect(stub.captured.method).toBe('GET')
    expect(stub.captured.url).toContain('/console/api/all-workspaces')
    expect(stub.captured.url).toContain('keyword=Ops')
    expect(stub.captured.url).toContain('status=normal')
    expect(res.data[0]?.id).toBe('ws-1')
    expect(res.total).toBe(1)
  })

  it('POSTs /all-workspaces to create on behalf of an owner', async () => {
    stub = await startStubServer((cap) =>
      jsonResponder(
        201,
        {
          result: 'success',
          tenant: { id: 'ws-new', name: 'Team', status: 'normal' },
        },
        cap,
      ),
    )

    const res = await makeClient(stub.url).create({
      name: 'Team',
      owner_email: 'owner@example.com',
    })

    expect(stub.captured.method).toBe('POST')
    expect(stub.captured.url).toBe('/console/api/all-workspaces')
    expect(JSON.parse(stub.captured.body ?? '{}')).toEqual({
      name: 'Team',
      owner_email: 'owner@example.com',
    })
    expect(res.tenant.id).toBe('ws-new')
  })

  it('POSTs archive and unarchive paths', async () => {
    stub = await startStubServer((cap) => jsonResponder(200, { result: 'success' }, cap))
    const client = makeClient(stub.url)

    await client.archive('ws-1')
    expect(stub.captured.url).toBe('/console/api/all-workspaces/ws-1/archive')

    await client.unarchive('ws-1')
    expect(stub.captured.url).toBe('/console/api/all-workspaces/ws-1/unarchive')

    await client.rename('ws-1', { name: 'Renamed' })
    expect(stub.captured.url).toBe('/console/api/all-workspaces/ws-1/info')
    expect(JSON.parse(stub.captured.body ?? '{}')).toEqual({ name: 'Renamed' })
  })

  it('assigns, lists, updates, and removes workspace members', async () => {
    stub = await startStubServer((cap) =>
      jsonResponder(
        200,
        {
          result: 'success',
          created_account: false,
          added: true,
          data: [
            { id: 'acct-1', name: 'Editor', email: 'e@x.com', role: 'admin', status: 'active' },
          ],
          member: {
            id: 'acct-1',
            name: 'Editor',
            email: 'e@x.com',
            role: 'admin',
            status: 'active',
          },
        },
        cap,
      ),
    )
    const client = makeClient(stub.url)

    await client.assignMember('ws-1', { email: 'editor@example.com', role: 'editor' })
    expect(stub.captured.method).toBe('POST')
    expect(stub.captured.url).toBe('/console/api/all-workspaces/ws-1/members')

    const listed = await client.listMembers('ws-1')
    expect(stub.captured.method).toBe('GET')
    expect(listed.data[0]?.id).toBe('acct-1')

    await client.updateMemberRole('ws-1', 'acct-1', { role: 'normal' })
    expect(stub.captured.method).toBe('PATCH')
    expect(stub.captured.url).toBe('/console/api/all-workspaces/ws-1/members/acct-1')

    await client.removeMember('ws-1', 'acct-1')
    expect(stub.captured.method).toBe('DELETE')
    expect(stub.captured.url).toBe('/console/api/all-workspaces/ws-1/members/acct-1')
  })
})
