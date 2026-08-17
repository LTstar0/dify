export class DeleteAllWorkspaceMemberOutput {
  readonly memberId: string
  readonly textLine: string

  constructor(memberId: string, textLine: string) {
    this.memberId = memberId
    this.textLine = textLine
  }

  text(): string {
    return this.textLine
  }

  json() {
    return { id: this.memberId }
  }

  name(): string {
    return this.memberId
  }
}
