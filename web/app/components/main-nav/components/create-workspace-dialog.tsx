'use client'

import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import { Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@langgenius/dify-ui/dialog'
import { Input } from '@langgenius/dify-ui/input'
import { toast } from '@langgenius/dify-ui/toast'
import { useMutation } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { consoleQuery } from '@/service/client'
import { basePath } from '@/utils/var'
import { getCreateWorkspaceErrorCode } from './create-workspace-error'

const workspaceNameMaxLength = 255

type CreateWorkspaceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const inputId = useId()
  const errorId = useId()
  const createWorkspaceMutation = useMutation(consoleQuery.workspaces.post.mutationOptions())
  const normalizedName = name.trim()
  const hasError = name.length > 0 && normalizedName.length === 0
  const isSubmitDisabled = normalizedName.length === 0 || createWorkspaceMutation.isPending
  const nameErrorMessage = useMemo(() => {
    if (!hasError) return ''
    return t(($) => $['errorMsg.fieldRequired'], {
      ns: 'common',
      field: t(($) => $['account.workspaceName'], { ns: 'common' }),
    })
  }, [hasError, t])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setName('')
    onOpenChange(nextOpen)
  }

  const handleSubmit = async () => {
    if (isSubmitDisabled) return

    try {
      await createWorkspaceMutation.mutateAsync({ body: { name: normalizedName } })
      toast.success(t(($) => $['actionMsg.modifiedSuccessfully'], { ns: 'common' }))
      location.assign(`${location.origin}${basePath}`)
    } catch (error) {
      const code = getCreateWorkspaceErrorCode(error)
      if (code === 'not_allowed_create_workspace') {
        toast.error(t(($) => $['mainNav.workspace.createNotAllowed'], { ns: 'common' }))
        return
      }
      if (code === 'limit_exceeded') {
        toast.error(t(($) => $['mainNav.workspace.createLimitReached'], { ns: 'common' }))
        return
      }
      toast.error(t(($) => $['actionMsg.modifiedUnsuccessfully'], { ns: 'common' }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent backdropProps={{ forceRender: true }}>
        <DialogCloseButton />
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="mb-4 pr-8">
            <DialogTitle className="text-xl font-semibold text-text-primary">
              {t(($) => $['mainNav.workspace.createTitle'], { ns: 'common' })}
            </DialogTitle>
          </div>
          <div className="space-y-2">
            <label htmlFor={inputId} className="block text-sm font-medium text-text-primary">
              {t(($) => $['account.workspaceName'], { ns: 'common' })}
            </label>
            <Input
              id={inputId}
              value={name}
              maxLength={workspaceNameMaxLength}
              placeholder={t(($) => $['mainNav.workspace.createPlaceholder'], { ns: 'common' })}
              onChange={(event) => {
                setName(event.target.value)
              }}
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              className={cn(
                hasError &&
                  'border-components-input-border-destructive bg-components-input-bg-destructive hover:border-components-input-border-destructive hover:bg-components-input-bg-destructive focus:border-components-input-border-destructive focus:bg-components-input-bg-destructive',
              )}
            />
            <div className="min-h-6">
              {hasError && (
                <p id={errorId} className="system-xs-regular text-text-destructive" role="alert">
                  {nameErrorMessage}
                </p>
              )}
            </div>
          </div>
          <div className="sticky bottom-0 -mx-2 mt-2 flex flex-wrap items-center justify-end gap-x-2 bg-components-panel-bg px-2 pt-4">
            <Button size="large" type="button" onClick={() => handleOpenChange(false)}>
              {t(($) => $['operation.cancel'], { ns: 'common' })}
            </Button>
            <Button
              size="large"
              type="submit"
              variant="primary"
              disabled={isSubmitDisabled}
              loading={createWorkspaceMutation.isPending}
            >
              {t(($) => $['operation.create'], { ns: 'common' })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
