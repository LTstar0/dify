import type { AdminMemberAssignResponse } from '@/api/all-workspaces'

export class CreateAllWorkspaceMemberOutput {
  readonly response: AdminMemberAssignResponse
  readonly textLine: string

  constructor(response: AdminMemberAssignResponse, textLine: string) {
    this.response = response
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json(): AdminMemberAssignResponse {
    return this.response
  }

  name(): string {
    return this.response.member.id
  }
}
