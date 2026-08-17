import { buildAdminContext } from '@/admin/context'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Flags } from '@/framework/flags'
import { OutputFormat, raw, table } from '@/framework/output'
import { realStreams } from '@/sys/io/streams'
import { runGetAllWorkspaces } from './run'

export default class GetAllWorkspaces extends DifyCommand {
  static override description = 'List every workspace on the instance (ADMIN_API_KEY)'

  static override examples = [
    '<%= config.bin %> get all-workspaces',
    '<%= config.bin %> get all-workspaces --status archive -o json',
    '<%= config.bin %> get all-workspaces --keyword ops --host https://dify.example.com',
  ]

  static override flags = {
    host: Flags.string({ description: 'Dify host URL', default: '' }),
    insecure: Flags.boolean({
      description: 'allow http:// hosts and skip TLS certificate verification (local-dev only)',
      default: false,
    }),
    keyword: Flags.string({ description: 'filter by workspace name', default: '' }),
    status: Flags.string({
      description: 'filter by status',
      options: ['normal', 'archive'],
      default: '',
    }),
    page: Flags.integer({ description: 'page number', default: 1 }),
    limit: Flags.integer({ description: 'page size', default: 20 }),
    'http-retry': httpRetryFlag,
    output: Flags.outputFormat({
      options: [OutputFormat.JSON, OutputFormat.YAML, OutputFormat.NAME, OutputFormat.WIDE],
      default: '',
    }),
  }

  async run(argv: string[]) {
    const { flags } = this.parse(GetAllWorkspaces, argv)
    const format = flags.output
    const ctx = await buildAdminContext({
      host: flags.host,
      insecure: flags.insecure,
      retryAttempts: flags['http-retry'],
      io: realStreams(format),
    })
    const result = await runGetAllWorkspaces(
      {
        keyword: flags.keyword === '' ? undefined : flags.keyword,
        status: flags.status === '' ? undefined : (flags.status as 'normal' | 'archive'),
        page: flags.page,
        limit: flags.limit,
      },
      { http: ctx.http, io: ctx.io },
    )
    if (result.kind === 'empty') return raw(result.message)
    return table({ format, data: result.data })
  }
}
