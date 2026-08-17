'use client'

import type { MemberInviteResponse } from '@dify/contracts/api/console/workspaces/types.gen'
import type { ReactElement } from 'react'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@langgenius/dify-ui/dialog'
import { SegmentedControl, SegmentedControlItem } from '@langgenius/dify-ui/segmented-control'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AssignMemberForm } from './assign-member-dialog'
import { InviteForm } from './invite-modal'

type AddMemberMode = 'assign' | 'invite'

type AddMemberDialogProps = {
  open: boolean
  trigger: ReactElement
  isEmailSetup: boolean
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
  onInvited: (invitationResults: MemberInviteResponse['invitation_results']) => void
}

export function AddMemberDialog({
  open,
  trigger,
  isEmailSetup,
  onOpenChange,
  onAssigned,
  onInvited,
}: AddMemberDialogProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AddMemberMode>('assign')
  const isAssign = mode === 'assign'
  const title = isAssign
    ? t(($) => $['members.assignAccount'], { ns: 'common' })
    : t(($) => $['members.inviteTeamMember'], { ns: 'common' })
  const description = isAssign
    ? t(($) => $['members.assignAccountTip'], { ns: 'common' })
    : t(($) => $['members.inviteTeamMemberTip'], { ns: 'common' })

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setMode('assign')
        onOpenChange(nextOpen)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent backdropProps={{ forceRender: true }}>
        <div className="grid gap-1 pr-8">
          <DialogTitle className="text-xl font-semibold text-text-primary">{title}</DialogTitle>
          <DialogDescription className="text-sm text-text-tertiary">
            {description}
          </DialogDescription>
        </div>
        <SegmentedControl<AddMemberMode>
          value={[mode]}
          onValueChange={(nextValue) => {
            const nextMode = nextValue[0]
            if (nextMode) setMode(nextMode)
          }}
          aria-label={t(($) => $['members.invite'], { ns: 'common' })}
          className="w-full"
        >
          <SegmentedControlItem<AddMemberMode> value="assign" className="flex-1">
            {t(($) => $['members.addMemberModeAssign'], {
              ns: 'common',
              defaultValue: 'Join immediately',
            })}
          </SegmentedControlItem>
          <SegmentedControlItem<AddMemberMode> value="invite" className="flex-1">
            {t(($) => $['members.addMemberModeInvite'], {
              ns: 'common',
              defaultValue: 'Send invitation',
            })}
          </SegmentedControlItem>
        </SegmentedControl>
        {isAssign ? (
          <AssignMemberForm onOpenChange={onOpenChange} onAssigned={onAssigned} />
        ) : (
          <InviteForm isEmailSetup={isEmailSetup} onOpenChange={onOpenChange} onSend={onInvited} />
        )}
        <DialogCloseButton aria-label={t(($) => $['operation.close'], { ns: 'common' })} />
      </DialogContent>
    </Dialog>
  )
}
