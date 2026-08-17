import type { WorkspacePaginationResponse } from '@dify/contracts/api/console/all-workspaces/types.gen'
import type { TableCell, TableColumn } from '@/framework/output'

export const ALL_WORKSPACE_COLUMNS: readonly TableColumn[] = [
  { name: 'ID', priority: 0 },
  { name: 'NAME', priority: 0 },
  { name: 'STATUS', priority: 0 },
  { name: 'MEMBERS', priority: 0 },
]

export class AllWorkspaceRow {
  readonly id: string
  readonly displayName: string
  readonly status: string
  readonly memberCount: number

  constructor(id: string, displayName: string, status: string, memberCount: number) {
    this.id = id
    this.displayName = displayName
    this.status = status
    this.memberCount = memberCount
  }

  tableRow(): readonly TableCell[] {
    return [this.id, this.displayName, this.status, String(this.memberCount)]
  }

  name(): string {
    return this.id
  }

  json() {
    return {
      id: this.id,
      name: this.displayName,
      status: this.status,
      member_count: this.memberCount,
    }
  }
}

export class AllWorkspaceListOutput {
  readonly rows: readonly AllWorkspaceRow[]
  readonly envelope: WorkspacePaginationResponse

  constructor(rows: readonly AllWorkspaceRow[], envelope: WorkspacePaginationResponse) {
    this.rows = rows
    this.envelope = envelope
  }

  static tableColumns(): readonly TableColumn[] {
    return ALL_WORKSPACE_COLUMNS
  }

  tableColumns(): readonly TableColumn[] {
    return AllWorkspaceListOutput.tableColumns()
  }

  tableRows(): readonly (readonly TableCell[])[] {
    return this.rows.map((row) => row.tableRow())
  }

  name(): string {
    return this.rows.map((row) => row.name()).join('\n')
  }

  json(): WorkspacePaginationResponse {
    return this.envelope
  }
}
