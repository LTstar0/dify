# Members page

Owns the current-workspace member list, role details, ownership transfer, and adding members.

Adding members uses a single **Add** button. [`add-member-dialog.tsx`] chooses the mode:

| Mode             | Owner                        | Behavior                                                                                                               |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Join immediately | [`assign-member-dialog.tsx`] | `POST /workspaces/current/members`. Creates or reuses the account and writes membership immediately.                   |
| Send invitation  | [`invite-modal`]             | `POST /workspaces/current/members/invite-email`. Email or activation link; existing active accounts join after accept. |

Workspace archive / leave for the current workspace is triggered from this header and confirmed by `WorkspaceLifecycleDialog`.

Product and API overview: [`docs/workspaces.md`].

[`add-member-dialog.tsx`]: ./add-member-dialog.tsx
[`assign-member-dialog.tsx`]: ./assign-member-dialog.tsx
[`docs/workspaces.md`]: ../../../../../../docs/workspaces.md
[`invite-modal`]: ./invite-modal
