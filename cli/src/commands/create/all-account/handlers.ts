import type { AdminAccountCreateResponse } from '@/api/all-accounts'

export class CreateAllAccountOutput {
  readonly response: AdminAccountCreateResponse
  readonly textLine: string

  constructor(response: AdminAccountCreateResponse, textLine: string) {
    this.response = response
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json(): AdminAccountCreateResponse {
    return this.response
  }

  name(): string {
    return this.response.account.id
  }
}
