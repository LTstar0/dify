'use client'

import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogCancelButton,
  AlertDialogConfirmButton,
  AlertDialogContent,
  AlertDialogTitle,
} from '@langgenius/dify-ui/alert-dialog'
import { toast } from '@langgenius/dify-ui/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { consoleQuery } from '@/service/client'
import { basePath } from '@/utils/var'
import { getWorkspaceLifecycleErrorCode } from './workspace-lifecycle-error'

export type WorkspaceLifecycleAction = 'archive' | 'leave' | 'unarchive'

type WorkspaceLifecycleDialogProps = {
  action: WorkspaceLifecycleAction | null
  tenantId: string | null
  onOpenChange: (open: boolean) => void
}

export function WorkspaceLifecycleDialog({
  action,
  tenantId,
  onOpenChange,
}: WorkspaceLifecycleDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const archiveMutation = useMutation(consoleQuery.workspaces.archive.post.mutationOptions())
  const leaveMutation = useMutation(consoleQuery.workspaces.leave.post.mutationOptions())
  const unarchiveMutation = useMutation(consoleQuery.workspaces.unarchive.post.mutationOptions())
  const isPending =
    archiveMutation.isPending || leaveMutation.isPending || unarchiveMutation.isPending
  const open = action !== null && tenantId !== null

  const titleKey =
    action === 'archive'
      ? 'mainNav.workspace.archiveConfirmTitle'
      : action === 'unarchive'
        ? 'mainNav.workspace.unarchiveConfirmTitle'
        : 'mainNav.workspace.leaveConfirmTitle'
  const descriptionKey =
    action === 'archive'
      ? 'mainNav.workspace.archiveConfirmDescription'
      : action === 'unarchive'
        ? 'mainNav.workspace.unarchiveConfirmDescription'
        : 'mainNav.workspace.leaveConfirmDescription'

  const handleConfirm = async () => {
    if (!action || !tenantId) return

    try {
      const body = { tenant_id: tenantId }
      if (action === 'archive') await archiveMutation.mutateAsync({ body })
      else if (action === 'unarchive') await unarchiveMutation.mutateAsync({ body })
      else await leaveMutation.mutateAsync({ body })
      toast.success(t(($) => $['actionMsg.modifiedSuccessfully'], { ns: 'common' }))
      if (action === 'unarchive') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: consoleQuery.workspaces.get.queryKey() }),
          queryClient.invalidateQueries({
            queryKey: consoleQuery.workspaces.archived.get.queryKey(),
          }),
        ])
        onOpenChange(false)
        return
      }
      location.assign(`${location.origin}${basePath}`)
    } catch (error) {
      const code = getWorkspaceLifecycleErrorCode(error)
      const message =
        code === 'cannot_archive_last_workspace'
          ? t(($) => $['mainNav.workspace.cannotArchiveLast'], { ns: 'common' })
          : code === 'cannot_leave_last_workspace'
            ? t(($) => $['mainNav.workspace.cannotLeaveLast'], { ns: 'common' })
            : code === 'owner_cannot_leave'
              ? t(($) => $['mainNav.workspace.ownerCannotLeave'], { ns: 'common' })
              : code === 'workspace_already_archived'
                ? t(($) => $['mainNav.workspace.alreadyArchived'], { ns: 'common' })
                : code === 'workspace_not_archived'
                  ? t(($) => $['mainNav.workspace.notArchived'], { ns: 'common' })
                  : code === 'limit_exceeded'
                    ? t(($) => $['mainNav.workspace.unarchiveLimitReached'], { ns: 'common' })
                    : t(($) => $['actionMsg.modifiedUnsuccessfully'], { ns: 'common' })
      toast.error(message)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(false)
      }}
    >
      <AlertDialogContent backdropProps={{ forceRender: true }}>
        <div className="flex flex-col gap-2 px-6 pt-6 pb-4">
          <AlertDialogTitle className="w-full truncate title-2xl-semi-bold text-text-primary">
            {t(($) => $[titleKey], { ns: 'common' })}
          </AlertDialogTitle>
          <div className="w-full system-md-regular text-text-tertiary">
            {t(($) => $[descriptionKey], { ns: 'common' })}
          </div>
        </div>
        <AlertDialogActions>
          <AlertDialogCancelButton>
            {t(($) => $['operation.cancel'], { ns: 'common' })}
          </AlertDialogCancelButton>
          <AlertDialogConfirmButton
            loading={isPending}
            disabled={isPending}
            onClick={() => void handleConfirm()}
          >
            {t(($) => $['operation.confirm'], { ns: 'common' })}
          </AlertDialogConfirmButton>
        </AlertDialogActions>
      </AlertDialogContent>
    </AlertDialog>
  )
}
