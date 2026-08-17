'use client'

import type { ReactElement } from 'react'
import { Button } from '@langgenius/dify-ui/button'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@langgenius/dify-ui/dialog'
import { Field, FieldControl, FieldError, FieldLabel } from '@langgenius/dify-ui/field'
import { Form } from '@langgenius/dify-ui/form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '@/context/i18n'
// oxlint-disable-next-line no-restricted-imports
import { post } from '@/service/base'
import { commonQueryKeys } from '@/service/use-common'
import { RoleSelector } from './invite-modal/role-selector'

type AssignMemberDialogProps = {
  open: boolean
  trigger: ReactElement
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
}

type AssignFormValues = {
  email: string
  name: string
  password: string
  role: string
}

type AssignMemberResponse = {
  result: 'success'
  created_account: boolean
  added: boolean
  tenant_id: string
}

export function AssignMemberForm({
  onOpenChange,
  onAssigned,
}: {
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const { mutate, isPending } = useMutation({
    mutationFn: (body: {
      email: string
      name?: string
      password?: string
      role: string
      language: string
    }) => post<AssignMemberResponse>('/workspaces/current/members', { body }),
  })

  return (
    <Form<AssignFormValues>
      aria-label={t(($) => $['members.assignAccount'], {
        ns: 'common',
        defaultValue: 'Assign tenant access',
      })}
      className="grid gap-4 pt-5"
      onFormSubmit={({ email, name, password, role }) => {
        if (isPending) return
        setFormError(null)
        mutate(
          {
            email: email.trim(),
            name: name.trim() || undefined,
            password: password.trim() || undefined,
            role,
            language: locale,
          },
          {
            onSuccess: () => {
              void queryClient.invalidateQueries({ queryKey: commonQueryKeys.members })
              onOpenChange(false)
              onAssigned()
            },
            onError: (error) => {
              const message = error instanceof Error ? error.message : String(error)
              if (
                message.includes('account_password_required') ||
                message.includes('Password is required')
              ) {
                setFormError(
                  t(($) => $['members.passwordRequired'], {
                    ns: 'common',
                    defaultValue: 'Password is required for a new account.',
                  }),
                )
                return
              }
              setFormError(
                t(($) => $['members.assignAccountFailed'], {
                  ns: 'common',
                  defaultValue: 'Could not assign tenant access.',
                }),
              )
            },
          },
        )
      }}
    >
      <Field name="email">
        <FieldLabel>{t(($) => $['members.email'], { ns: 'common' })}</FieldLabel>
        <FieldControl type="email" autoComplete="off" required />
        <FieldError />
      </Field>
      <Field name="name">
        <FieldLabel>
          {t(($) => $['members.accountName'], { ns: 'common', defaultValue: 'Name' })}
        </FieldLabel>
        <FieldControl
          autoComplete="off"
          placeholder={t(($) => $['members.namePlaceholder'], {
            ns: 'common',
            defaultValue: 'Display name',
          })}
        />
      </Field>
      <Field name="password">
        <FieldLabel>
          {t(($) => $['members.password'], { ns: 'common', defaultValue: 'Password' })}
        </FieldLabel>
        <FieldControl
          type="password"
          autoComplete="new-password"
          placeholder={t(($) => $['members.passwordPlaceholder'], {
            ns: 'common',
            defaultValue: 'Required for new accounts: 8+ characters with letters and numbers',
          })}
        />
      </Field>
      <RoleSelector disabled={isPending} />
      {formError && (
        <div role="alert" className="body-xs-regular text-text-destructive">
          {formError}
        </div>
      )}
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={isPending}
        disabled={isPending}
      >
        {t(($) => $['members.assignAccountSubmit'], { ns: 'common', defaultValue: 'Assign' })}
      </Button>
    </Form>
  )
}

export function AssignMemberDialog({
  open,
  trigger,
  onOpenChange,
  onAssigned,
}: AssignMemberDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent backdropProps={{ forceRender: true }}>
        <div className="grid gap-1 pr-8">
          <DialogTitle className="text-xl font-semibold text-text-primary">
            {t(($) => $['members.assignAccount'], {
              ns: 'common',
              defaultValue: 'Assign tenant access',
            })}
          </DialogTitle>
          <DialogDescription className="text-sm text-text-tertiary">
            {t(($) => $['members.assignAccountTip'], {
              ns: 'common',
              defaultValue:
                'Add an existing account or create a new one, then grant a workspace role immediately.',
            })}
          </DialogDescription>
        </div>
        <AssignMemberForm onOpenChange={onOpenChange} onAssigned={onAssigned} />
        <DialogCloseButton aria-label={t(($) => $['operation.close'], { ns: 'common' })} />
      </DialogContent>
    </Dialog>
  )
}
