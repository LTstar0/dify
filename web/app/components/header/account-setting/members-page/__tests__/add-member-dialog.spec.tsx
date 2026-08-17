import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AddMemberDialog } from '../add-member-dialog'

vi.mock('../assign-member-dialog', () => ({
  AssignMemberForm: () => <div>Assign form</div>,
}))
vi.mock('../invite-modal', () => ({
  InviteForm: () => <div>Invite form</div>,
}))

describe('AddMemberDialog', () => {
  it('keeps one add entry and switches between assign and invite', async () => {
    const user = userEvent.setup()
    render(
      <AddMemberDialog
        open
        trigger={<button type="button">Add</button>}
        isEmailSetup={false}
        onOpenChange={vi.fn()}
        onAssigned={vi.fn()}
        onInvited={vi.fn()}
      />,
    )

    expect(screen.getByText('Assign form')).toBeInTheDocument()
    expect(screen.queryByText('Invite form')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /addMemberModeInvite/ }))
    expect(screen.getByText('Invite form')).toBeInTheDocument()
    expect(screen.queryByText('Assign form')).not.toBeInTheDocument()
  })
})
