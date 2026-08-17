import type { PostAllWorkspacesResponse } from '@dify/contracts/api/console/all-workspaces/types.gen'

export class CreateAllWorkspaceOutput {
  readonly response: PostAllWorkspacesResponse
  readonly textLine: string

  constructor(response: PostAllWorkspacesResponse, textLine: string) {
    this.response = response
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json(): PostAllWorkspacesResponse {
    return this.response
  }

  name(): string {
    return this.response.tenant.id
  }
}
