import type { CommandEffect } from '@/framework/command'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Args, Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { runLeaveWorkspace } from './run'

export default class LeaveWorkspace extends DifyCommand {
  static override description = 'Leave a workspace (defaults to the active workspace)'

  static override effect: CommandEffect = 'destructive'

  static override examples = [
    '<%= config.bin %> leave workspace',
    '<%= config.bin %> leave workspace ws-abc123 --yes',
    '<%= config.bin %> leave workspace -o json --yes',
  ]

  static override args = {
    workspaceId: Args.string({
      description: 'workspace id to leave (defaults to the active workspace)',
      required: false,
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
    const { args, flags } = this.parse(LeaveWorkspace, argv)
    const format = flags.output
    const ctx = await this.authedCtx({ retryFlag: flags['http-retry'], format })
    const data = await runLeaveWorkspace(
      { workspaceId: args.workspaceId, yes: flags.yes },
      { reg: ctx.reg, active: ctx.active, http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
