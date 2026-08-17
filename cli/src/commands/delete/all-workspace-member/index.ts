import type { CommandEffect } from '@/framework/command'
import { buildAdminContext } from '@/admin/context'
import { DifyCommand } from '@/commands/_shared/dify-command'
import { httpRetryFlag } from '@/commands/_shared/global-flags'
import { Args, Flags } from '@/framework/flags'
import { formatted, OutputFormat } from '@/framework/output'
import { realStreams } from '@/sys/io/streams'
import { runDeleteAllWorkspaceMember } from './run'

export default class DeleteAllWorkspaceMember extends DifyCommand {
  static override description = 'Remove a member from any workspace (ADMIN_API_KEY)'

  static override effect: CommandEffect = 'write'

  static override examples = [
    '<%= config.bin %> delete all-workspace-member acct-1 --workspace ws-1 --yes',
  ]

  static override args = {
    memberId: Args.string({ description: 'account id of the member to remove', required: true }),
  }

  static override flags = {
    workspace: Flags.string({ char: 'w', description: 'workspace id', required: true }),
    yes: Flags.boolean({ description: 'skip confirmation', default: false }),
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
    const { args, flags } = this.parse(DeleteAllWorkspaceMember, argv)
    const format = flags.output
    const ctx = await buildAdminContext({
      host: flags.host,
      insecure: flags.insecure,
      retryAttempts: flags['http-retry'],
      io: realStreams(format),
    })
    const data = await runDeleteAllWorkspaceMember(
      { workspaceId: flags.workspace, memberId: args.memberId, yes: flags.yes },
      { http: ctx.http, io: ctx.io },
    )
    return formatted({ format, data })
  }
}
