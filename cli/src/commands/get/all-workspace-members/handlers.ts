import type { AdminMemberListResponse } from '@/api/all-workspaces'
import type { TableCell, TableColumn } from '@/framework/output'

export const ALL_WORKSPACE_MEMBER_COLUMNS: readonly TableColumn[] = [
  { name: 'ID', priority: 0 },
  { name: 'EMAIL', priority: 0 },
  { name: 'NAME', priority: 0 },
  { name: 'ROLE', priority: 0 },
  { name: 'STATUS', priority: 0 },
]

export class AllWorkspaceMemberRow {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly role: string
  readonly status: string

  constructor(id: string, email: string, displayName: string, role: string, status: string) {
    this.id = id
    this.email = email
    this.displayName = displayName
    this.role = role
    this.status = status
  }

  tableRow(): readonly TableCell[] {
    return [this.id, this.email, this.displayName, this.role, this.status]
  }

  name(): string {
    return this.id
  }
}

export class AllWorkspaceMemberListOutput {
  readonly rows: readonly AllWorkspaceMemberRow[]
  readonly envelope: AdminMemberListResponse

  constructor(rows: readonly AllWorkspaceMemberRow[], envelope: AdminMemberListResponse) {
    this.rows = rows
    this.envelope = envelope
  }

  static tableColumns(): readonly TableColumn[] {
    return ALL_WORKSPACE_MEMBER_COLUMNS
  }

  tableColumns(): readonly TableColumn[] {
    return AllWorkspaceMemberListOutput.tableColumns()
  }

  tableRows(): readonly (readonly TableCell[])[] {
    return this.rows.map((row) => row.tableRow())
  }

  name(): string {
    return this.rows.map((row) => row.name()).join('\n')
  }

  json(): AdminMemberListResponse {
    return this.envelope
  }
}
