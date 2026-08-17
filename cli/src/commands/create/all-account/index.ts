import type { CommandEffect } from '@/framework/command'
import { buildAdminContext } from '@/admin/context'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { realStreams } from '@/sys/io/streams'
import { runCreateAllAccount } from './run'

export default class CreateAllAccount extends DifyCommand {
  static override description = 'Create an account without assigning a workspace (ADMIN_API_KEY)'

  static override effect: CommandEffect = 'write'

  static override examples = [
    '<%= config.bin %> create all-account --email editor@example.com --name Editor --password Passw0rd1',
  ]

  static override flags = {
    email: Flags.string({ description: 'account email', required: true }),
    name: Flags.string({ description: 'display name', required: true }),
    password: Flags.string({ description: 'login password', required: true }),
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
    const { flags } = this.parse(CreateAllAccount, argv)
    const format = flags.output
    const ctx = await buildAdminContext({
      host: flags.host,
      insecure: flags.insecure,
      retryAttempts: flags['http-retry'],
      io: realStreams(format),
    })
    const data = await runCreateAllAccount(
      { email: flags.email, name: flags.name, password: flags.password },
      { http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
