import type { CommandEffect } from '@/framework/command'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Args, Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { runArchiveWorkspace } from './run'

export default class ArchiveWorkspace extends DifyCommand {
  static override description = 'Archive a workspace (defaults to the active workspace)'

  static override effect: CommandEffect = 'destructive'

  static override examples = [
    '<%= config.bin %> archive workspace',
    '<%= config.bin %> archive workspace ws-abc123 --yes',
    '<%= config.bin %> archive workspace -o json --yes',
  ]

  static override args = {
    workspaceId: Args.string({
      description: 'workspace id to archive (defaults to the active workspace)',
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
    const { args, flags } = this.parse(ArchiveWorkspace, argv)
    const format = flags.output
    const ctx = await this.authedCtx({ retryFlag: flags['http-retry'], format })
    const data = await runArchiveWorkspace(
      { workspaceId: args.workspaceId, yes: flags.yes },
      { reg: ctx.reg, active: ctx.active, http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
