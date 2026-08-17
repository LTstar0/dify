import type { CommandEffect } from '@/framework/command'
import { buildAdminContext } from '@/admin/context'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Args, Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { realStreams } from '@/sys/io/streams'
import { runArchiveAllWorkspace } from './run'

export default class ArchiveAllWorkspace extends DifyCommand {
  static override description = 'Archive any workspace as an operator (ADMIN_API_KEY)'

  static override effect: CommandEffect = 'destructive'

  static override examples = ['<%= config.bin %> archive all-workspace ws-abc123 --yes']

  static override args = {
    workspaceId: Args.string({ description: 'workspace id to archive', required: true }),
  }

  static override flags = {
    host: Flags.string({ description: 'Dify host URL', default: '' }),
    insecure: Flags.boolean({
      description: 'allow http:// hosts and skip TLS certificate verification (local-dev only)',
      default: false,
    }),
    yes: Flags.boolean({ char: 'y', description: 'skip confirmation prompt', default: false }),
    'http-retry': httpRetryFlag,
    output: Flags.outputFormat({
      options: [OutputFormat.JSON, OutputFormat.YAML, OutputFormat.NAME, OutputFormat.TEXT],
      default: '',
    }),
  }

  async run(argv: string[]) {
    const { args, flags } = this.parse(ArchiveAllWorkspace, argv)
    const format = flags.output
    const ctx = await buildAdminContext({
      host: flags.host,
      insecure: flags.insecure,
      retryAttempts: flags['http-retry'],
      io: realStreams(format),
    })
    const data = await runArchiveAllWorkspace(
      { workspaceId: args.workspaceId, yes: flags.yes },
      { http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
