import type { PostAllWorkspacesByWorkspaceIdUnarchiveResponse } from '@dify/contracts/api/console/all-workspaces/types.gen'

export class UnarchiveAllWorkspaceOutput {
  readonly response: PostAllWorkspacesByWorkspaceIdUnarchiveResponse
  readonly textLine: string

  constructor(response: PostAllWorkspacesByWorkspaceIdUnarchiveResponse, textLine: string) {
    this.response = response
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json(): PostAllWorkspacesByWorkspaceIdUnarchiveResponse {
    return this.response
  }

  name(): string {
    return 'result' in this.response && typeof this.response.result === 'string'
      ? this.response.result
      : ''
  }
}
