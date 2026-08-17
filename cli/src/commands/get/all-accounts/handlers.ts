import type { AdminAccountPagination } from '@/api/all-accounts'
import type { TableCell, TableColumn } from '@/framework/output'

export const ALL_ACCOUNT_COLUMNS: readonly TableColumn[] = [
  { name: 'ID', priority: 0 },
  { name: 'EMAIL', priority: 0 },
  { name: 'NAME', priority: 0 },
  { name: 'STATUS', priority: 0 },
  { name: 'WORKSPACES', priority: 0 },
]

export class AllAccountRow {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly status: string
  readonly workspaceCount: number

  constructor(
    id: string,
    email: string,
    displayName: string,
    status: string,
    workspaceCount: number,
  ) {
    this.id = id
    this.email = email
    this.displayName = displayName
    this.status = status
    this.workspaceCount = workspaceCount
  }

  tableRow(): readonly TableCell[] {
    return [this.id, this.email, this.displayName, this.status, String(this.workspaceCount)]
  }

  name(): string {
    return this.id
  }

  json() {
    return {
      id: this.id,
      email: this.email,
      name: this.displayName,
      status: this.status,
      workspace_count: this.workspaceCount,
    }
  }
}

export class AllAccountListOutput {
  readonly rows: readonly AllAccountRow[]
  readonly envelope: AdminAccountPagination

  constructor(rows: readonly AllAccountRow[], envelope: AdminAccountPagination) {
    this.rows = rows
    this.envelope = envelope
  }

  static tableColumns(): readonly TableColumn[] {
    return ALL_ACCOUNT_COLUMNS
  }

  tableColumns(): readonly TableColumn[] {
    return AllAccountListOutput.tableColumns()
  }

  tableRows(): readonly (readonly TableCell[])[] {
    return this.rows.map((row) => row.tableRow())
  }

  name(): string {
    return this.rows.map((row) => row.name()).join('\n')
  }

  json(): AdminAccountPagination {
    return this.envelope
  }
}
