import type { HttpClient } from '@/http/types'
import type { IOStreams } from '@/sys/io/streams'
import { AllWorkspacesClient } from '@/api/all-workspaces'
import { BaseError } from '@/errors/base'
import { ErrorCode } from '@/errors/codes'
import { runWithSpinner } from '@/sys/io/spinner'
import { nullStreams } from '@/sys/io/streams'
import { AllWorkspaceMemberListOutput, AllWorkspaceMemberRow } from './handlers.js'

export const EMPTY_ALL_WORKSPACE_MEMBERS_MESSAGE = 'No members in this workspace.\n'

export type GetAllWorkspaceMembersDeps = {
  readonly http: HttpClient
  readonly io?: IOStreams
  readonly clientFactory?: (http: HttpClient) => AllWorkspacesClient
}

export type GetAllWorkspaceMembersResult =
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'output'; readonly data: AllWorkspaceMemberListOutput }

export async function runGetAllWorkspaceMembers(
  workspaceId: string,
  deps: GetAllWorkspaceMembersDeps,
): Promise<GetAllWorkspaceMembersResult> {
  const id = workspaceId.trim()
  if (id === '') {
    throw new BaseError({
      code: ErrorCode.UsageMissingArg,
      message: '--workspace is required',
    })
  }
  const factory = deps.clientFactory ?? ((h: HttpClient) => new AllWorkspacesClient(h))
  const io = deps.io ?? nullStreams()
  const envelope = await runWithSpinner({ io, label: 'Fetching members' }, () =>
    factory(deps.http).listMembers(id),
  )
  if (envelope.data.length === 0)
    return { kind: 'empty', message: EMPTY_ALL_WORKSPACE_MEMBERS_MESSAGE }
  return {
    kind: 'output',
    data: new AllWorkspaceMemberListOutput(
      envelope.data.map(
        (member) =>
          new AllWorkspaceMemberRow(
            member.id,
            member.email,
            member.name,
            member.role,
            member.status,
          ),
      ),
      envelope,
    ),
  }
}
