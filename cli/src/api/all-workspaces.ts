import type {
  AdminWorkspaceCreatePayload,
  GetAllWorkspacesData,
  PostAllWorkspacesByWorkspaceIdInfoData,
  PostAllWorkspacesByWorkspaceIdUnarchiveResponse,
  PostAllWorkspacesResponse,
  WorkspaceLifecycleResponse,
  WorkspacePaginationResponse,
  WorkspaceTenantResultResponse,
} from '@dify/contracts/api/console/all-workspaces/types.gen'
import type { AllWorkspacesApiClient } from '@/http/orpc'
import type { HttpClient } from '@/http/types'
import { createAllWorkspacesClient } from '@/http/orpc'

export type AllWorkspacesListQuery = NonNullable<GetAllWorkspacesData['query']>
export type AllWorkspaceRenamePayload = NonNullable<PostAllWorkspacesByWorkspaceIdInfoData['body']>

export type AdminMemberItem = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: string
  readonly status: string
}

export type AdminMemberListResponse = {
  readonly data: readonly AdminMemberItem[]
}

export type AdminMemberAssignPayload = {
  readonly email: string
  readonly role: string
  readonly name?: string
  readonly password?: string
  readonly language?: string
}

export type AdminMemberRolePayload = {
  readonly role: string
}

export type AdminMemberAssignResponse = {
  readonly result: string
  readonly created_account: boolean
  readonly added: boolean
  readonly member: AdminMemberItem
}

export class AllWorkspacesClient {
  private readonly http: HttpClient
  private readonly orpc: AllWorkspacesApiClient

  constructor(http: HttpClient) {
    this.http = http
    this.orpc = createAllWorkspacesClient(http)
  }

  async list(query: AllWorkspacesListQuery = {}): Promise<WorkspacePaginationResponse> {
    return this.orpc.allWorkspaces.get({ query })
  }

  async create(payload: AdminWorkspaceCreatePayload): Promise<PostAllWorkspacesResponse> {
    return this.orpc.allWorkspaces.post({ body: payload })
  }

  async rename(
    workspaceId: string,
    payload: AllWorkspaceRenamePayload,
  ): Promise<WorkspaceTenantResultResponse> {
    return this.orpc.allWorkspaces.byWorkspaceId.info.post({
      params: { workspace_id: workspaceId },
      body: payload,
    })
  }

  async archive(workspaceId: string): Promise<WorkspaceLifecycleResponse> {
    return this.orpc.allWorkspaces.byWorkspaceId.archive.post({
      params: { workspace_id: workspaceId },
    })
  }

  async unarchive(workspaceId: string): Promise<PostAllWorkspacesByWorkspaceIdUnarchiveResponse> {
    return this.orpc.allWorkspaces.byWorkspaceId.unarchive.post({
      params: { workspace_id: workspaceId },
    })
  }

  async listMembers(workspaceId: string): Promise<AdminMemberListResponse> {
    return this.http.get<AdminMemberListResponse>(`/all-workspaces/${workspaceId}/members`)
  }

  async assignMember(
    workspaceId: string,
    payload: AdminMemberAssignPayload,
  ): Promise<AdminMemberAssignResponse> {
    return this.http.post<AdminMemberAssignResponse>(`/all-workspaces/${workspaceId}/members`, {
      json: payload,
    })
  }

  async updateMemberRole(
    workspaceId: string,
    accountId: string,
    payload: AdminMemberRolePayload,
  ): Promise<AdminMemberAssignResponse> {
    return this.http.patch<AdminMemberAssignResponse>(
      `/all-workspaces/${workspaceId}/members/${accountId}`,
      { json: payload },
    )
  }

  async removeMember(workspaceId: string, accountId: string): Promise<{ result: string }> {
    return this.http.delete<{ result: string }>(
      `/all-workspaces/${workspaceId}/members/${accountId}`,
    )
  }
}
