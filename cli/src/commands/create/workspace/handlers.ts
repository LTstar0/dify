import type { WorkspaceDetailResponse } from '@dify/contracts/api/openapi/types.gen'

export class CreateWorkspaceOutput {
  readonly response: WorkspaceDetailResponse
  readonly textLine: string

  constructor(response: WorkspaceDetailResponse, textLine: string) {
    this.response = response
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json(): WorkspaceDetailResponse {
    return this.response
  }

  name(): string {
    return this.response.id
  }
}
