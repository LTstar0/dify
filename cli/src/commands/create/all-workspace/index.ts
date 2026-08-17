import type { CommandEffect } from '@/framework/command'
import { buildAdminContext } from '@/admin/context'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { realStreams } from '@/sys/io/streams'
import { runCreateAllWorkspace } from './run'

export default class CreateAllWorkspace extends DifyCommand {
  static override description = 'Create a workspace for an existing account (ADMIN_API_KEY)'

  static override effect: CommandEffect = 'write'

  static override examples = [
    '<%= config.bin %> create all-workspace --name "Team Space" --owner-email owner@example.com',
  ]

  static override flags = {
    name: Flags.string({ description: 'workspace name', required: true }),
    'owner-email': Flags.string({
      description: 'existing account that will own the workspace',
      required: true,
    }),
    host: Flags.string({ description: 'Dify host URL', default: '' }),
    insecure: Flags.boolean({
      description: 'allow http:// hosts and skip TLS certificate verification (local-dev only)',
      default: false,
    }),
    'http-retry': httpRetryFlag,
    output: Flags.outputFormat({
      options: [OutputFormat.JSON, OutputFormat.YAML, OutputFormat.NAME, OutputFormat.TEXT],
      default: '',
    }),
  }

  async run(argv: string[]) {
    const { flags } = this.parse(CreateAllWorkspace, argv)
    const format = flags.output
    const ctx = await buildAdminContext({
      host: flags.host,
      insecure: flags.insecure,
      retryAttempts: flags['http-retry'],
      io: realStreams(format),
    })
    const data = await runCreateAllWorkspace(
      { name: flags.name, ownerEmail: flags['owner-email'] },
      { http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
