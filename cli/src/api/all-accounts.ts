import type { HttpClient } from '@/http/types'

export type AccountMembership = {
  readonly tenant_id: string
  readonly tenant_name: string
  readonly role: string
  readonly status: string
}

export type AdminAccountItem = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly status: string
  readonly created_at?: number | null
  readonly memberships: readonly AccountMembership[]
}

export type AdminAccountPagination = {
  readonly data: readonly AdminAccountItem[]
  readonly has_more: boolean
  readonly limit: number
  readonly page: number
  readonly total: number
}

export type AdminAccountCreatePayload = {
  readonly email: string
  readonly name: string
  readonly password: string
  readonly language?: string
}

export type AdminAccountCreateResponse = {
  readonly result: string
  readonly account: AdminAccountItem
}

export type AllAccountsListQuery = {
  readonly keyword?: string
  readonly page?: number
  readonly limit?: number
}

export class AllAccountsClient {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async list(query: AllAccountsListQuery = {}): Promise<AdminAccountPagination> {
    return this.http.get<AdminAccountPagination>('/all-accounts', { searchParams: query })
  }

  async create(payload: AdminAccountCreatePayload): Promise<AdminAccountCreateResponse> {
    return this.http.post<AdminAccountCreateResponse>('/all-accounts', { json: payload })
  }
}
