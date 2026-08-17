import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { AllWorkspaceListOutput, AllWorkspaceRow } from './handlers.js'

export const EMPTY_ALL_WORKSPACES_MESSAGE = 'No workspaces match the current filters.\n'

export type GetAllWorkspacesOptions = {
  readonly keyword?: string
  readonly status?: 'normal' | 'archive'
  readonly page?: number
  readonly limit?: number
}

export type GetAllWorkspacesDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export type GetAllWorkspacesResult =
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'output'; readonly data: AllWorkspaceListOutput }

export async function runGetAllWorkspaces(
  opts: GetAllWorkspacesOptions,
  deps: GetAllWorkspacesDeps,
): Promise<GetAllWorkspacesResult> {
  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllWorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const envelope = await runWithSpinner({ io, label: 'Fetching all workspaces' }, () =>
    factory(deps.http).list({
      keyword: opts.keyword,
      status: opts.status,
      page: opts.page,
      limit: opts.limit,
    }),
  )
  if (envelope.data.length === 0) return { kind: 'empty', message: EMPTY_ALL_WORKSPACES_MESSAGE }
  return {
    kind: 'output',
    data: new AllWorkspaceListOutput(
      envelope.data.map(
        (workspace) =>
          new AllWorkspaceRow(
            workspace.id,
            workspace.name ?? workspace.id,
            workspace.status ?? '',
            workspace.member_count ?? 0,
          ),
      ),
      envelope,
    ),
  }
}
