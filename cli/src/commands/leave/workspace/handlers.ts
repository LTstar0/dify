import type { WorkspaceLifecycleResponse } from '@dify/contracts/api/openapi/types.gen'

export class LeaveWorkspaceOutput {
  readonly response: WorkspaceLifecycleResponse
  readonly textLine: string

  constructor(response: WorkspaceLifecycleResponse, textLine: string) {
    this.response = response
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json(): WorkspaceLifecycleResponse {
    return this.response
  }

  name(): string {
    return this.response.workspace?.id ?? ''
  }
}
