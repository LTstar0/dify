import { buildAdminContext } from '@/admin/context'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Flags } from '@/framework/flags'
import { OutputFormat, raw, table } from '@/framework/output'
import { realStreams } from '@/sys/io/streams'
import { runGetAllWorkspaceMembers } from './run'

export default class GetAllWorkspaceMembers extends DifyCommand {
  static override description = 'List members of any workspace (ADMIN_API_KEY)'

  static override examples = ['<%= config.bin %> get all-workspace-members --workspace ws-1']

  static override flags = {
    workspace: Flags.string({ char: 'w', description: 'workspace id', required: true }),
    host: Flags.string({ description: 'Dify host URL', default: '' }),
    insecure: Flags.boolean({
      description: 'allow http:// hosts and skip TLS certificate verification (local-dev only)',
      default: false,
    }),
    'http-retry': httpRetryFlag,
    output: Flags.outputFormat({
      options: [OutputFormat.JSON, OutputFormat.YAML, OutputFormat.NAME, OutputFormat.WIDE],
      default: '',
    }),
  }

  async run(argv: string[]) {
    const { flags } = this.parse(GetAllWorkspaceMembers, argv)
    const format = flags.output
    const ctx = await buildAdminContext({
      host: flags.host,
      insecure: flags.insecure,
      retryAttempts: flags['http-retry'],
      io: realStreams(format),
    })
    const result = await runGetAllWorkspaceMembers(flags.workspace, { http: ctx.http, io: ctx.io })
    if (result.kind === 'empty') return raw(result.message)
    return table({ format, data: result.data })
  }
}
