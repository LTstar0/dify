import type { CommandEffect } from '@/framework/command'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Args, Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { runUnarchiveWorkspace } from './run'

export default class UnarchiveWorkspace extends DifyCommand {
  static override description = 'Restore an archived workspace'

  static override effect: CommandEffect = 'write'

  static override examples = [
    '<%= config.bin %> unarchive workspace ws-abc123 --yes',
    '<%= config.bin %> unarchive workspace ws-abc123 -o json --yes',
  ]

  static override args = {
    workspaceId: Args.string({
      description: 'archived workspace id to restore',
      required: true,
    }),
  }

  static override flags = {
    'http-retry': httpRetryFlag,
    output: Flags.outputFormat({
      options: [OutputFormat.JSON, OutputFormat.YAML, OutputFormat.NAME, OutputFormat.TEXT],
      default: '',
    }),
    yes: Flags.boolean({ char: 'y', description: 'skip confirmation prompt', default: false }),
  }

  async run(argv: string[]) {
    const { args, flags } = this.parse(UnarchiveWorkspace, argv)
    const format = flags.output
    const ctx = await this.authedCtx({ retryFlag: flags['http-retry'], format })
    const data = await runUnarchiveWorkspace(
      { workspaceId: args.workspaceId, yes: flags.yes },
      { reg: ctx.reg, active: ctx.active, http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
