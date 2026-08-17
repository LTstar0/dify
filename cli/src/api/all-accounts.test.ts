import type { StubServer } from '@test/fixtures/stub-server'
import { jsonResponder, startStubServer } from '@test/fixtures/stub-server'
import { afterEach, describe, expect, it } from 'vitest'
import { createHttpClient } from '@/http/client'
import { consoleBase } from '@/util/host'
import { AllAccountsClient } from './all-accounts.js'

function makeClient(host: string): AllAccountsClient {
  return new AllAccountsClient(
    createHttpClient({ baseURL: consoleBase(host), bearer: 'admin-key' }),
  )
}

describe('AllAccountsClient', () => {
  let stub: StubServer

  afterEach(async () => {
    await stub?.stop()
  })

  it('GETs /all-accounts with filters', async () => {
    stub = await startStubServer((cap) =>
      jsonResponder(
        200,
        {
          data: [
            {
              id: 'acct-1',
              name: 'Ops',
              email: 'ops@example.com',
              status: 'active',
              memberships: [],
            },
          ],
          has_more: false,
          limit: 20,
          page: 1,
          total: 1,
        },
        cap,
      ),
    )

    const res = await makeClient(stub.url).list({ keyword: 'ops', page: 1, limit: 20 })

    expect(stub.captured.method).toBe('GET')
    expect(stub.captured.url).toContain('/console/api/all-accounts')
    expect(stub.captured.url).toContain('keyword=ops')
    expect(res.data[0]?.email).toBe('ops@example.com')
  })

  it('POSTs /all-accounts to create an account', async () => {
    stub = await startStubServer((cap) =>
      jsonResponder(
        201,
        {
          result: 'success',
          account: {
            id: 'acct-2',
            name: 'Editor',
            email: 'editor@example.com',
            status: 'active',
            memberships: [],
          },
        },
        cap,
      ),
    )

    const res = await makeClient(stub.url).create({
      email: 'editor@example.com',
      name: 'Editor',
      password: 'Passw0rd1',
    })

    expect(stub.captured.method).toBe('POST')
    expect(stub.captured.url).toBe('/console/api/all-accounts')
    expect(JSON.parse(stub.captured.body ?? '{}')).toEqual({
      email: 'editor@example.com',
      name: 'Editor',
      password: 'Passw0rd1',
    })
    expect(res.account.id).toBe('acct-2')
  })
})
