# 工作区与租户权限

在 Dify 里，**工作区就是租户**。没有单独的组织 / Space 层。应用、知识库、成员和角色都属于某一个工作区。

## 概念

| 术语 | 含义 |
| --- | --- |
| 工作区 / 租户 | 隔离边界，对应 `tenants` 与 `tenant_account_joins` |
| 账号 | 全局登录身份，可加入多个工作区 |
| 成员关系 | `(账号, 工作区, 角色)`，这就是租户权限 |
| 当前工作区 | `current=true` 的那条成员关系，切换工作区会改这个标记 |

可分配角色（不能在这里指定 Owner，转让所有权走单独流程）：

| 角色 | 典型权限 |
| --- | --- |
| `owner` | 全部权限，含归档和转让 |
| `admin` | 管理成员和工作区设置 |
| `editor` | 创建和编辑应用 |
| `normal` | 使用工作区资源 |
| `dataset_operator` | 仅管理知识库（需开启） |

## 控制台操作

### 创建、切换、归档、恢复

1. 打开左侧工作区菜单。
2. 策略允许时显示 **创建工作区**（Community/Cloud 看 `ALLOW_CREATE_WORKSPACE`，企业版另有许可证上限）。
3. 在列表里归档 / 恢复。最后一个工作区不能归档。
4. 非所有者看到的是 **离开**，不是归档。所有者不能离开，需先转让。

### 添加成员

打开 **工作区设置 → 成员**，点 **添加**。

对话框有两种模式：

| 模式 | 适用 | 结果 |
| --- | --- | --- |
| **立即加入** | 自托管 / 本地，希望马上能登录 | 账号不存在则创建（必须设密码），立刻写入成员关系 |
| **发送邀请** | 需要邮件或激活链接 | 发送或返回邀请链接；已有活跃账号需对方接受后才加入 |

成员进列表后，点开行可以改角色。不能在这里把人改成 Owner。

## 环境变量

写在 `api/.env`（Compose 则在 `docker/envs/core-services/shared.env`）：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `ALLOW_CREATE_WORKSPACE` | `false` | 允许用户创建更多工作区 |
| `ALLOW_REGISTER` | `false` | 开放自助注册。成员分配仍可用 `is_setup=true` 创建账号 |
| `ADMIN_API_KEY` | 空 | 运营接口的 Bearer |
| `ADMIN_API_KEY_ENABLE` | `false` | 部分 admin-key 登录路径需要；控制台 `admin_required` 在 key 匹配时即可 |
| `RBAC_ENABLED` | `false` | 企业 RBAC。关闭时使用传统工作区角色 |

企业版许可证的工作区数和席位检查仍然有效。

## 控制台 API（已登录用户）

登录后使用 Cookie + `X-CSRF-Token`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/console/api/workspaces` | 当前账号加入的工作区 |
| `GET` | `/console/api/workspaces/policy` | 是否允许创建 |
| `POST` | `/console/api/workspaces` | 创建并切换 |
| `POST` | `/console/api/workspaces/switch` | `{ "tenant_id": "..." }` |
| `POST` | `/console/api/workspaces/archive` | 归档 |
| `GET` | `/console/api/workspaces/archived` | 已归档（所有者） |
| `POST` | `/console/api/workspaces/unarchive` | 恢复 |
| `POST` | `/console/api/workspaces/leave` | 非所有者离开 |
| `GET` | `/console/api/workspaces/current/members` | 成员列表 |
| `POST` | `/console/api/workspaces/current/members` | 立即分配：`{ email, role, name?, password?, language? }` |
| `POST` | `/console/api/workspaces/current/members/invite-email` | 邀请 |
| `PUT` | `/console/api/workspaces/current/members/<id>/update-role` | 改角色 |
| `DELETE` | `/console/api/workspaces/current/members/<id>` | 移除 |

立即分配示例：

```bash
curl -X POST http://localhost:5001/console/api/workspaces/current/members \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b cookies.txt \
  -d '{"email":"editor@example.com","name":"Editor","password":"Passw0rd1","role":"editor"}'
```

新账号密码至少 8 位，且同时包含字母和数字。已有账号只需 `email` 和 `role`。

## 运营 API（`ADMIN_API_KEY`）

请求头：`Authorization: Bearer <ADMIN_API_KEY>`。**不要**带上用户 Cookie，否则 Cookie JWT 会盖住 admin key。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/console/api/all-workspaces` | `keyword`、`status`、`page`、`limit` |
| `POST` | `/console/api/all-workspaces` | `{ "name", "owner_email" }` |
| `POST` | `/console/api/all-workspaces/<id>/info` | 改名 |
| `POST` | `/console/api/all-workspaces/<id>/archive` | 归档（可留下无其他工作区的成员） |
| `POST` | `/console/api/all-workspaces/<id>/unarchive` | 恢复 |
| `GET` | `/console/api/all-accounts` | 账号及其成员关系 |
| `POST` | `/console/api/all-accounts` | 只创建账号 |
| `GET` | `/console/api/all-workspaces/<id>/members` | 任意工作区成员 |
| `POST` | `/console/api/all-workspaces/<id>/members` | 分配 `{ email, role, name?, password? }` |
| `PATCH` | `/console/api/all-workspaces/<id>/members/<account_id>` | `{ "role" }` |
| `DELETE` | `/console/api/all-workspaces/<id>/members/<account_id>` | 移除 |

用户态 OpenAPI 对应接口在 `/openapi/v1/workspaces`。

## CLI（`difyctl`）

用户会话（`difyctl auth login`）：

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

运营（必须设置 `DIFY_ADMIN_API_KEY`）：

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

## 本地开发注意

- 要创建多个工作区，在 `api/.env` 设 `ALLOW_CREATE_WORKSPACE=true` 后重启 API。
- 首页模型接口会打 plugin-daemon（`:5002`）。请从 `docker/docker-compose.middleware.yaml` 启动 `plugin_daemon`，否则 `summary` / `llm` 会 400。
- 密码登录会先把密码做 Base64，再 `POST /console/api/login`。
- Next.js 开发服务器默认只认 `http://localhost:3000`，用 `127.0.0.1` 会拦静态资源。
