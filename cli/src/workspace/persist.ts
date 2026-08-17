import type { WorkspaceDetailResponse } from '@dify/contracts/api/openapi/types.gen'
import type { ActiveContext, Registry, Workspace } from '@/auth/hosts'

export function workspaceFromDetail(detail: WorkspaceDetailResponse): Workspace {
  return { id: detail.id, name: detail.name, role: detail.role }
}

/**
 * Persist the caller's active workspace after a server-side switch/create.
 * Only call after the OpenAPI write succeeds so `hosts.yml` cannot drift.
 */
export async function persistActiveWorkspace(
  reg: Registry,
  active: ActiveContext,
  workspace: Workspace | undefined,
): Promise<void> {
  reg.upsert(active.host, active.email, { ...active.ctx, workspace })
  await reg.save()
}
