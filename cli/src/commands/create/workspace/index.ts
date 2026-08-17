import type { CommandEffect } from '@/framework/command'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { runCreateWorkspace } from './run'

export default class CreateWorkspace extends DifyCommand {
  static override description = 'Create a workspace and switch the active context to it'

  static override effect: CommandEffect = 'write'

  static override examples = [
    '<%= config.bin %> create workspace --name "Team Space"',
    '<%= config.bin %> create workspace --name ops -o json',
  ]

  static override flags = {
    name: Flags.string({ description: 'workspace name', required: true }),
    'http-retry': httpRetryFlag,
    output: Flags.outputFormat({
      options: [OutputFormat.JSON, OutputFormat.YAML, OutputFormat.NAME, OutputFormat.TEXT],
      default: '',
    }),
  }

  async run(argv: string[]) {
    const { flags } = this.parse(CreateWorkspace, argv)
    const format = flags.output
    const ctx = await this.authedCtx({ retryFlag: flags['http-retry'], format })
    const data = await runCreateWorkspace(
      { name: flags.name },
      { reg: ctx.reg, active: ctx.active, http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
