# Workspaces and tenant access

In Dify, a **workspace is a tenant**. There is no separate organization or space layer. Apps, knowledge, members, and roles all belong to one workspace.

## Concepts

| Term | Meaning |
| --- | --- |
| Workspace / Tenant | Isolation boundary. Stored as `tenants` plus `tenant_account_joins`. |
| Account | Global login identity. One account can join many workspaces. |
| Membership | `(account, workspace, role)` row. This is how tenant permission is granted. |
| Current workspace | The membership flagged `current=true`. Switching workspaces changes this flag. |

Assignable membership roles (owner cannot be assigned here; transfer ownership is a separate flow):

| Role | Typical access |
| --- | --- |
| `owner` | Full control, including archive and ownership transfer |
| `admin` | Manage members and workspace settings |
| `editor` | Build and edit apps |
| `normal` | Use workspace resources |
| `dataset_operator` | Manage knowledge bases only (when enabled) |

## Console UI

### Create, switch, archive, restore

1. Open the workspace menu in the left nav.
2. **Create workspace** is shown when policy allows it (`ALLOW_CREATE_WORKSPACE=true` on Community/Cloud, plus license limits on Enterprise).
3. Archive / restore from the workspace list. The last remaining workspace cannot be archived.
4. Non-owners see **Leave** instead of **Archive**. Owners cannot leave; they must transfer ownership first.

### Add a member

Open **Workspace settings → Members**, then **Add**.

The dialog has two modes:

| Mode | When to use | Result |
| --- | --- | --- |
| **Join immediately** | Self-hosted or local setup; you want access now | Creates the account if needed (password required) and writes the membership immediately |
| **Send invitation** | You want an email or activation link | Sends or returns an invite link; existing active accounts do not join until they accept |

After someone is in the list, open their row to change role. Owner cannot be set this way.

## Environment

Set these in `api/.env` (or `docker/envs/core-services/shared.env` for Compose):

| Variable | Default | Effect |
| --- | --- | --- |
| `ALLOW_CREATE_WORKSPACE` | `false` | Lets users create additional workspaces |
| `ALLOW_REGISTER` | `false` | Public self-signup. Member assignment still creates accounts with `is_setup=true` |
| `ADMIN_API_KEY` | empty | Bearer token for operator (`all-*`) APIs |
| `ADMIN_API_KEY_ENABLE` | `false` | Required for some admin-key login paths; console `admin_required` routes accept a matching `ADMIN_API_KEY` bearer |
| `RBAC_ENABLED` | `false` | Enterprise RBAC. When off, legacy workspace roles are used |

Enterprise also enforces license workspace and seat limits. Those checks stay in place.

## Console APIs (signed-in user)

Cookie + `X-CSRF-Token` after `/console/api/login`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/console/api/workspaces` | Workspaces the caller belongs to |
| `GET` | `/console/api/workspaces/policy` | Whether the caller may create |
| `POST` | `/console/api/workspaces` | Create and switch |
| `POST` | `/console/api/workspaces/switch` | `{ "tenant_id": "..." }` |
| `POST` | `/console/api/workspaces/archive` | Archive current or specified workspace |
| `GET` | `/console/api/workspaces/archived` | Archived workspaces the caller owns |
| `POST` | `/console/api/workspaces/unarchive` | Restore |
| `POST` | `/console/api/workspaces/leave` | Non-owner leave |
| `GET` | `/console/api/workspaces/current/members` | Member list |
| `POST` | `/console/api/workspaces/current/members` | Immediate assign: `{ email, role, name?, password?, language? }` |
| `POST` | `/console/api/workspaces/current/members/invite-email` | Invite flow |
| `PUT` | `/console/api/workspaces/current/members/<id>/update-role` | Change role |
| `DELETE` | `/console/api/workspaces/current/members/<id>` | Remove member |

Immediate assign example:

```bash
curl -X POST http://localhost:5001/console/api/workspaces/current/members \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b cookies.txt \
  -d '{"email":"editor@example.com","name":"Editor","password":"Passw0rd1","role":"editor"}'
```

New accounts need a password of at least 8 characters with letters and numbers. Existing accounts only need `email` and `role`.

## Operator APIs (`ADMIN_API_KEY`)

Send `Authorization: Bearer <ADMIN_API_KEY>` and **do not** send the user session cookie (the cookie JWT would shadow the admin key).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/console/api/all-workspaces` | `keyword`, `status`, `page`, `limit` |
| `POST` | `/console/api/all-workspaces` | `{ "name", "owner_email" }` |
| `POST` | `/console/api/all-workspaces/<id>/info` | Rename |
| `POST` | `/console/api/all-workspaces/<id>/archive` | May leave members without another workspace |
| `POST` | `/console/api/all-workspaces/<id>/unarchive` | Restore |
| `GET` | `/console/api/all-accounts` | Accounts plus memberships |
| `POST` | `/console/api/all-accounts` | Create account only |
| `GET` | `/console/api/all-workspaces/<id>/members` | Members of any workspace |
| `POST` | `/console/api/all-workspaces/<id>/members` | Assign `{ email, role, name?, password? }` |
| `PATCH` | `/console/api/all-workspaces/<id>/members/<account_id>` | `{ "role" }` |
| `DELETE` | `/console/api/all-workspaces/<id>/members/<account_id>` | Remove |

User-scoped OpenAPI equivalents live under `/openapi/v1/workspaces` (list/create/archive/unarchive/leave and `/members`).

## CLI (`difyctl`)

User session (`difyctl auth login`):

```sh
difyctl get workspace
difyctl create workspace --name "Team Space"
difyctl archive workspace --yes
difyctl unarchive workspace <id> --yes
difyctl leave workspace --yes
difyctl create member --email user@example.com --role normal
difyctl get member
difyctl set member <account-id> --role admin
difyctl delete member <account-id> --yes
```

Operator (`DIFY_ADMIN_API_KEY` must be set):

```sh
export DIFY_ADMIN_API_KEY=...
difyctl get all-workspaces
difyctl create all-workspace --name ops --owner-email owner@example.com
difyctl archive all-workspace <id> --yes
difyctl unarchive all-workspace <id> --yes
difyctl get all-accounts
difyctl create all-account --email user@example.com --name User --password Passw0rd1
difyctl create all-workspace-member --workspace <id> --email user@example.com --role editor --password Passw0rd1
difyctl get all-workspace-members --workspace <id>
difyctl set all-workspace-member <account-id> --workspace <id> --role admin
difyctl delete all-workspace-member <account-id> --workspace <id> --yes
```

## Local development notes

- Creating extra workspaces requires `ALLOW_CREATE_WORKSPACE=true` in `api/.env`, then restart the API.
- Model/plugin pages call plugin-daemon on `:5002`. Start `plugin_daemon` from `docker/docker-compose.middleware.yaml`, or a local stub, to avoid Home-page `summary` / `llm` 400s.
- Password login encrypts the password as Base64 before `POST /console/api/login`.
- Next.js dev only serves assets from `http://localhost:3000` (not `127.0.0.1`) unless `allowedDevOrigins` is set.
