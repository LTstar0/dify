import type { CommandEffect } from '@/framework/command'
import { buildAdminContext } from '@/admin/context'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { realStreams } from '@/sys/io/streams'
import { runCreateAllWorkspaceMember } from './run'

export default class CreateAllWorkspaceMember extends DifyCommand {
  static override description = 'Assign an account to any workspace with a role (ADMIN_API_KEY)'

  static override effect: CommandEffect = 'write'

  static override examples = [
    '<%= config.bin %> create all-workspace-member --workspace ws-1 --email editor@example.com --role editor --password Passw0rd1',
  ]

  static override flags = {
    workspace: Flags.string({ char: 'w', description: 'workspace id', required: true }),
    email: Flags.string({ description: 'account email', required: true }),
    role: Flags.string({
      description: 'role to assign (normal|admin|editor|dataset_operator)',
      required: true,
    }),
    name: Flags.string({ description: 'display name when creating a new account', default: '' }),
    password: Flags.string({ description: 'password when creating a new account', default: '' }),
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
    const { flags } = this.parse(CreateAllWorkspaceMember, argv)
    const format = flags.output
    const ctx = await buildAdminContext({
      host: flags.host,
      insecure: flags.insecure,
      retryAttempts: flags['http-retry'],
      io: realStreams(format),
    })
    const data = await runCreateAllWorkspaceMember(
      {
        workspaceId: flags.workspace,
        email: flags.email,
        role: flags.role,
        name: flags.name === '' ? undefined : flags.name,
        password: flags.password === '' ? undefined : flags.password,
      },
      { http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
