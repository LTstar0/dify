export class SetAllWorkspaceMemberOutput {
  readonly memberId: string
  readonly role: string
  readonly textLine: string

  constructor(memberId: string, role: string, textLine: string) {
    this.memberId = memberId
    this.role = role
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json() {
    return { id: this.memberId, role: this.role }
  }

  name(): string {
    return this.memberId
  }
}
