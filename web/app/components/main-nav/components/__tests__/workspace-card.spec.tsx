import type {
  GetWorkspacesCurrentSummaryResponse,
  TenantListItemResponse,
} from '@dify/contracts/api/console/workspaces/types.gen'
import type { ModalContextState } from '@/context/modal-context'
import type { ProviderContextState } from '@/context/provider-context'
import { zLicenseStatus } from '@dify/contracts/api/console/system-features/zod.gen'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ACCOUNT_SETTING_TAB } from '@/app/components/header/account-setting/constants'
import { useModalContext } from '@/context/modal-context'
import { useProviderContext } from '@/context/provider-context'
import { consoleQuery } from '@/service/client'
import {
  createConsoleQueryClient,
  renderWithConsoleQuery,
  seedSystemFeaturesLicense,
} from '@/test/console/query-data'
import { WorkspaceCard } from '../workspace-card'

const {
  mockFetchWorkspaces,
  mockFetchWorkspacePolicy,
  mockFetchArchivedWorkspaces,
  mockSwitchWorkspace,
  mockCreateWorkspace,
  mockArchiveWorkspace,
  mockLeaveWorkspace,
  mockUnarchiveWorkspace,
  mockCurrentWorkspaceQueryKey,
  mockWorkspacesQueryKey,
  mockWorkspacePolicyQueryKey,
  mockArchivedWorkspacesQueryKey,
} = vi.hoisted(() => ({
  mockFetchWorkspaces: vi.fn(),
  mockFetchWorkspacePolicy: vi.fn(),
  mockFetchArchivedWorkspaces: vi.fn(),
  mockSwitchWorkspace: vi.fn(),
  mockCreateWorkspace: vi.fn(),
  mockArchiveWorkspace: vi.fn(),
  mockLeaveWorkspace: vi.fn(),
  mockUnarchiveWorkspace: vi.fn(),
  mockCurrentWorkspaceQueryKey: ['console', 'workspaces', 'current', 'summary', 'get'] as const,
  mockWorkspacesQueryKey: ['console', 'workspaces', 'get'] as const,
  mockWorkspacePolicyQueryKey: ['console', 'workspaces', 'policy', 'get'] as const,
  mockArchivedWorkspacesQueryKey: ['console', 'workspaces', 'archived', 'get'] as const,
}))
const toastMocks = vi.hoisted(() => ({
  mockNotify: vi.fn(),
}))
const mockConsoleState = vi.hoisted(() => ({
  current: {
    workspacePermissionKeys: [] as string[],
  },
}))

vi.mock('@/context/provider-context', () => ({
  useProviderContext: vi.fn(),
}))

vi.mock('@/context/permission-state', async () => {
  const { createPermissionStateModuleMock } = await import('@/test/console/state-fixture')
  return createPermissionStateModuleMock(() => mockConsoleState.current)
})

vi.mock('@/context/modal-context', () => ({
  useModalContext: vi.fn(),
}))

vi.mock('@langgenius/dify-ui/toast', () => ({
  default: {
    notify: (args: unknown) => toastMocks.mockNotify(args),
  },
  toast: {
    success: (message: string) => toastMocks.mockNotify({ type: 'success', message }),
    error: (message: string) => toastMocks.mockNotify({ type: 'error', message }),
    warning: (message: string) => toastMocks.mockNotify({ type: 'warning', message }),
    info: (message: string) => toastMocks.mockNotify({ type: 'info', message }),
  },
}))

vi.mock('@/service/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/service/client')>()
  const consoleQuery = new Proxy(actual.consoleQuery, {
    get(target, prop, receiver) {
      if (prop === 'workspaces') {
        return {
          current: {
            summary: {
              get: {
                key: () => mockCurrentWorkspaceQueryKey,
                queryKey: () => mockCurrentWorkspaceQueryKey,
                queryOptions: (options?: object) => ({
                  queryKey: mockCurrentWorkspaceQueryKey,
                  queryFn: () => new Promise(() => {}),
                  ...options,
                }),
              },
            },
          },
          get: {
            queryKey: () => mockWorkspacesQueryKey,
            queryOptions: (options?: object) => ({
              queryKey: mockWorkspacesQueryKey,
              queryFn: mockFetchWorkspaces,
              ...options,
            }),
          },
          policy: {
            get: {
              queryKey: () => mockWorkspacePolicyQueryKey,
              queryOptions: (options?: object) => ({
                queryKey: mockWorkspacePolicyQueryKey,
                queryFn: mockFetchWorkspacePolicy,
                ...options,
              }),
            },
          },
          post: {
            mutationOptions: () => ({
              mutationFn: (variables: unknown) => mockCreateWorkspace(variables),
            }),
          },
          archive: {
            post: {
              mutationOptions: () => ({
                mutationFn: (variables: unknown) => mockArchiveWorkspace(variables),
              }),
            },
          },
          leave: {
            post: {
              mutationOptions: () => ({
                mutationFn: (variables: unknown) => mockLeaveWorkspace(variables),
              }),
            },
          },
          archived: {
            get: {
              queryKey: () => mockArchivedWorkspacesQueryKey,
              queryOptions: (options?: object) => ({
                queryKey: mockArchivedWorkspacesQueryKey,
                queryFn: mockFetchArchivedWorkspaces,
                ...options,
              }),
            },
          },
          unarchive: {
            post: {
              mutationOptions: () => ({
                mutationFn: (variables: unknown) => mockUnarchiveWorkspace(variables),
              }),
            },
          },
          switch: {
            post: {
              mutationOptions: () => ({
                mutationFn: (variables: unknown) => mockSwitchWorkspace(variables),
              }),
            },
          },
        }
      }

      return Reflect.get(target, prop, receiver)
    },
  })

  return {
    ...actual,
    consoleQuery,
  }
})

const currentWorkspaceValue: GetWorkspacesCurrentSummaryResponse = {
  id: 'workspace-1',
  name: 'Solar Studio',
  plan: 'sandbox',
  role: 'owner',
  credits: 7500,
  is_owner: true,
}

const mockSetShowPricingModal = vi.fn()
const mockSetSettingsDestination = vi.fn()
vi.mock('nuqs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nuqs')>()
  return { ...actual, useQueryState: () => [null, mockSetSettingsDestination] }
})
const disabledCreatePolicy = {
  is_allow_create_workspace: false,
  workspaces: { enabled: false, limit: 0, size: 0 },
}
const allowedCreatePolicy = {
  is_allow_create_workspace: true,
  workspaces: { enabled: false, limit: 0, size: 0 },
}
const exhaustedCreatePolicy = {
  is_allow_create_workspace: true,
  workspaces: { enabled: true, limit: 1, size: 1 },
}

let mockCurrentWorkspace: GetWorkspacesCurrentSummaryResponse | undefined = currentWorkspaceValue
let mockWorkspaces: TenantListItemResponse[] = []
let mockWorkspacePolicy = disabledCreatePolicy

const mockCurrentWorkspaceQuery = (
  data: GetWorkspacesCurrentSummaryResponse | undefined = currentWorkspaceValue,
  isPending = false,
) => {
  mockCurrentWorkspace = isPending ? undefined : data
}

type RenderWorkspaceCardOptions = Parameters<typeof renderWithConsoleQuery>[1] & {
  seedWorkspaces?: boolean
  seedPolicy?: boolean
  systemFeaturesLicense?: Parameters<typeof seedSystemFeaturesLicense>[1]
}

const renderWorkspaceCard = (options?: RenderWorkspaceCardOptions) => {
  const {
    seedWorkspaces = true,
    seedPolicy = true,
    systemFeaturesLicense,
    ...renderOptions
  } = options ?? {}
  const queryClient = createConsoleQueryClient()
  if (mockCurrentWorkspace)
    queryClient.setQueryData(consoleQuery.workspaces.current.summary.get.queryKey(), {
      ...mockCurrentWorkspace,
      is_owner: mockCurrentWorkspace.is_owner ?? mockCurrentWorkspace.role === 'owner',
    })
  if (seedWorkspaces)
    queryClient.setQueryData(consoleQuery.workspaces.get.queryKey(), {
      workspaces: mockWorkspaces.map((workspace) => ({
        ...workspace,
        is_owner: workspace.is_owner ?? false,
      })),
    })
  if (seedPolicy) queryClient.setQueryData(mockWorkspacePolicyQueryKey, mockWorkspacePolicy)
  if (systemFeaturesLicense) seedSystemFeaturesLicense(queryClient, systemFeaturesLicense)

  return renderWithConsoleQuery(<WorkspaceCard />, {
    ...renderOptions,
    queryClient,
    currentWorkspace: mockCurrentWorkspace ? undefined : null,
  })
}

const mockWorkspacePermissionKeys = (workspacePermissionKeys: string[]) => {
  mockConsoleState.current = {
    workspacePermissionKeys,
  }
}

describe('WorkspaceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaces = [
      {
        id: 'workspace-1',
        name: 'Solar Studio',
        plan: 'sandbox',
        status: 'normal',
        created_at: 0,
        current: true,
        is_owner: true,
      },
      {
        id: 'workspace-2',
        name: 'Evan Workspace',
        plan: 'team',
        status: 'normal',
        created_at: 0,
        current: false,
        is_owner: false,
      },
    ]
    mockWorkspacePolicy = disabledCreatePolicy
    mockFetchWorkspaces.mockResolvedValue({ workspaces: mockWorkspaces })
    mockFetchWorkspacePolicy.mockResolvedValue(disabledCreatePolicy)
    mockSwitchWorkspace.mockReturnValue(new Promise(() => {}))
    mockCreateWorkspace.mockResolvedValue({
      result: 'success',
      new_tenant: { id: 'workspace-3', name: 'New Space' },
    })
    mockArchiveWorkspace.mockResolvedValue({ result: 'success', switched: true })
    mockLeaveWorkspace.mockResolvedValue({ result: 'success', switched: true })
    mockUnarchiveWorkspace.mockResolvedValue({ result: 'success' })
    mockFetchArchivedWorkspaces.mockResolvedValue({ workspaces: [] })
    mockCurrentWorkspaceQuery()
    vi.mocked(useProviderContext).mockReturnValue({
      enableBilling: true,
      enableEducationPlan: false,
      isFetchedPlan: true,
      plan: { type: 'sandbox' },
    } as ProviderContextState)
    mockWorkspacePermissionKeys(['workspace.member.manage'])
    vi.mocked(useModalContext).mockReturnValue({
      setShowPricingModal: mockSetShowPricingModal,
    } as unknown as ModalContextState)
  })

  it('hides cloud-only credits and upgrade actions outside cloud edition', () => {
    renderWorkspaceCard()

    expect(
      screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /common\.mainNav\.workspace\.credits/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('billing.upgradeBtn.encourageShort')).not.toBeInTheDocument()
  })

  it('links workspace credits to model provider settings in cloud edition', () => {
    renderWorkspaceCard({ systemFeatures: { deployment_edition: 'CLOUD' } })

    expect(
      screen.getByRole('link', { name: /common\.mainNav\.workspace\.credits/ }),
    ).toHaveAttribute('href', '/integrations/model-provider')
  })

  it('renders unlimited credits from the summary contract', () => {
    mockCurrentWorkspaceQuery({ ...currentWorkspaceValue, credits: -1 })

    renderWorkspaceCard({ systemFeatures: { deployment_edition: 'CLOUD' } })

    expect(screen.getByText('common.license.unlimited')).toBeInTheDocument()
  })

  it('hides the credits link when the summary has no effective credits', () => {
    mockCurrentWorkspaceQuery({ ...currentWorkspaceValue, credits: null })

    renderWorkspaceCard({ systemFeatures: { deployment_edition: 'CLOUD' } })

    expect(
      screen.queryByRole('link', { name: /common\.mainNav\.workspace\.credits/ }),
    ).not.toBeInTheDocument()
  })

  it('renders a stable skeleton while the current workspace is loading', () => {
    mockCurrentWorkspaceQuery(undefined, true)

    renderWorkspaceCard()

    expect(
      screen.queryByRole('button', { name: 'common.mainNav.workspace.openMenu' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Evan Workspace')).not.toBeInTheDocument()
  })

  it('renders the current workspace before loading the workspace list', async () => {
    const user = userEvent.setup()
    renderWorkspaceCard({ seedWorkspaces: false })

    expect(
      screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Solar Studio')).toBeInTheDocument()
    expect(mockFetchWorkspaces).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    expect(await screen.findByRole('dialog', { name: 'Solar Studio' })).toBeInTheDocument()
    await waitFor(() => expect(mockFetchWorkspaces).toHaveBeenCalledOnce())
    expect(await screen.findByRole('button', { name: 'Evan Workspace' })).toBeInTheDocument()
  })

  it('prefetches the workspace list when the trigger is hovered', async () => {
    const user = userEvent.setup()
    renderWorkspaceCard({ seedWorkspaces: false })

    const trigger = screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' })
    await user.hover(trigger)

    await waitFor(() => expect(mockFetchWorkspaces).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog', { name: 'Solar Studio' })).not.toBeInTheDocument()

    await user.click(trigger)

    expect(await screen.findByRole('button', { name: 'Evan Workspace' })).toBeInTheDocument()
    expect(mockFetchWorkspaces).toHaveBeenCalledOnce()
  })

  it('prefetches the workspace list when the trigger receives keyboard focus', async () => {
    const user = userEvent.setup()
    renderWorkspaceCard({ seedWorkspaces: false })

    await user.tab()

    expect(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' })).toHaveFocus()
    await waitFor(() => expect(mockFetchWorkspaces).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog', { name: 'Solar Studio' })).not.toBeInTheDocument()
  })

  it('keeps workspace controls visible and disabled while the workspace list is loading', async () => {
    const user = userEvent.setup()
    mockFetchWorkspaces.mockReturnValue(new Promise(() => {}))
    renderWorkspaceCard({ seedWorkspaces: false })

    await user.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(within(panel).getByText('common.userProfile.workspace')).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.sort.openMenu' }),
    ).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'common.operation.search' })).toBeDisabled()
    expect(panel.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Evan Workspace' })).not.toBeInTheDocument()
  })

  it('uses the current workspace query for billing plan UI', () => {
    mockCurrentWorkspaceQuery({
      ...currentWorkspaceValue,
      plan: 'team',
    })
    vi.mocked(useProviderContext).mockReturnValue({
      enableBilling: false,
      enableEducationPlan: false,
      isFetchedPlan: true,
      plan: { type: 'sandbox' },
    } as ProviderContextState)
    renderWorkspaceCard({ systemFeatures: { deployment_edition: 'CLOUD' } })

    expect(screen.getByText('team')).toBeInTheDocument()
    expect(screen.getByText('billing.upgradeBtn.plain')).toBeInTheDocument()
    expect(screen.queryByText('sandbox')).not.toBeInTheDocument()
    expect(screen.queryByText('billing.upgradeBtn.encourageShort')).not.toBeInTheDocument()
  })

  it('uses the original paid plan badge for paid workspaces', () => {
    mockCurrentWorkspaceQuery({
      ...currentWorkspaceValue,
      plan: 'team',
    })
    renderWorkspaceCard({ systemFeatures: { deployment_edition: 'CLOUD' } })

    expect(screen.getByText('team')).toBeInTheDocument()
  })

  it('shows the Enterprise license status independently of the Cloud billing state', () => {
    mockCurrentWorkspaceQuery({
      ...currentWorkspaceValue,
      plan: null,
    })
    renderWorkspaceCard({
      systemFeatures: {
        deployment_edition: 'ENTERPRISE',
      },
      systemFeaturesLicense: {
        status: zLicenseStatus.enum.active,
      },
    })

    expect(screen.getByText('Enterprise')).toBeInTheDocument()
    expect(screen.queryByText('sandbox')).not.toBeInTheDocument()
  })

  it('opens workspace actions and switcher in a popover panel', async () => {
    renderWorkspaceCard()

    const workspaceTrigger = screen.getByRole('button', {
      name: 'common.mainNav.workspace.openMenu',
    })
    expect(workspaceTrigger).not.toHaveAttribute('data-popup-open')

    fireEvent.click(workspaceTrigger)

    expect(workspaceTrigger).toHaveAttribute('data-popup-open', '')

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveClass('w-[280px]')
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.settings' }),
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.inviteMembers' }),
    ).toBeInTheDocument()
    expect(within(panel).getByText('common.userProfile.workspace')).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.sort.openMenu' }),
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'common.operation.search' }),
    ).toBeInTheDocument()
    const workspaceItem = within(panel).getByRole('button', { name: 'Evan Workspace' })
    expect(workspaceItem).toBeInTheDocument()
    expect(workspaceItem.closest('[class*="max-h-[240px]"]')).toBeInTheDocument()
  })

  it('filters workspace switcher options from the search action', async () => {
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.operation.search' }))

    expect(screen.getByText('common.userProfile.workspace')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'common.mainNav.workspace.sort.openMenu' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.operation.search' })).toHaveClass(
      'bg-state-base-hover',
    )

    fireEvent.change(screen.getByPlaceholderText('common.mainNav.workspace.searchPlaceholder'), {
      target: { value: 'evan' },
    })

    const panel = screen.getByRole('dialog', { name: 'Solar Studio' })
    expect(within(panel).getByRole('button', { name: 'Evan Workspace' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Solar Studio' })).not.toBeInTheDocument()
  })

  it('sorts workspaces by last opened and can sort by created time', async () => {
    mockWorkspaces = [
      {
        id: 'workspace-1',
        name: 'Solar Studio',
        plan: 'sandbox',
        status: 'normal',
        created_at: 1,
        last_opened_at: 20,
        current: true,
        is_owner: true,
      },
      {
        id: 'workspace-2',
        name: 'Evan Workspace',
        plan: 'team',
        status: 'normal',
        created_at: 3,
        last_opened_at: null,
        current: false,
        is_owner: false,
      },
      {
        id: 'workspace-3',
        name: 'Atlas Workspace',
        plan: 'team',
        status: 'normal',
        created_at: 2,
        last_opened_at: 30,
        current: false,
        is_owner: false,
      },
    ]
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    const defaultWorkspaceOptions = within(panel)
      .getAllByRole('button')
      .map((item) => item.getAttribute('title'))
      .filter(Boolean)

    expect(defaultWorkspaceOptions).toEqual(['Atlas Workspace', 'Solar Studio', 'Evan Workspace'])

    const sortTrigger = screen.getByRole('button', {
      name: 'common.mainNav.workspace.sort.openMenu',
    })
    expect(sortTrigger).not.toHaveAttribute('data-popup-open')

    fireEvent.click(sortTrigger)

    expect(sortTrigger).toHaveAttribute('data-popup-open', '')

    expect(
      await screen.findByRole('menuitemradio', {
        name: 'common.mainNav.workspace.sort.lastOpened',
      }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: 'common.mainNav.workspace.sort.createdTime' }),
    )

    const createdTimeWorkspaceOptions = within(panel)
      .getAllByRole('button')
      .map((item) => item.getAttribute('title'))
      .filter(Boolean)

    expect(createdTimeWorkspaceOptions).toEqual([
      'Evan Workspace',
      'Atlas Workspace',
      'Solar Studio',
    ])
  })

  it('opens account settings from workspace menu actions', async () => {
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'common.mainNav.workspace.settings' }),
    )

    expect(mockSetSettingsDestination).toHaveBeenCalledWith(ACCOUNT_SETTING_TAB.BILLING)
  })

  it('opens members settings from workspace menu when billing is disabled', async () => {
    mockCurrentWorkspaceQuery({
      ...currentWorkspaceValue,
      plan: null,
    })

    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'common.mainNav.workspace.settings' }),
    )

    expect(mockSetSettingsDestination).toHaveBeenCalledWith(ACCOUNT_SETTING_TAB.MEMBERS)
    expect(mockSetSettingsDestination).not.toHaveBeenCalledWith(ACCOUNT_SETTING_TAB.BILLING)
  })

  it('switches workspace from the workspace switcher item', async () => {
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Evan Workspace' }))

    await waitFor(() =>
      expect(mockSwitchWorkspace).toHaveBeenCalledWith({ body: { tenant_id: 'workspace-2' } }),
    )
  })

  it('keeps workspace settings visible for dataset operators without member management permission', async () => {
    mockCurrentWorkspaceQuery({
      ...currentWorkspaceValue,
      role: 'dataset_operator',
    })
    mockWorkspacePermissionKeys([])

    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(panel).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.settings' }),
    ).toBeInTheDocument()
    expect(
      within(panel).queryByRole('button', { name: 'common.mainNav.workspace.inviteMembers' }),
    ).not.toBeInTheDocument()
  })

  it('shows invite members when member management permission is available', async () => {
    mockCurrentWorkspaceQuery({
      ...currentWorkspaceValue,
      role: 'normal',
    })
    mockWorkspacePermissionKeys(['workspace.member.manage'])

    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.settings' }),
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.inviteMembers' }),
    ).toBeInTheDocument()
  })

  it('hides invite members when member management permission is missing', async () => {
    mockWorkspacePermissionKeys([])

    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.settings' }),
    ).toBeInTheDocument()
    expect(
      within(panel).queryByRole('button', { name: 'common.mainNav.workspace.inviteMembers' }),
    ).not.toBeInTheDocument()
  })

  it('hides create workspace when policy does not allow it', async () => {
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(
      within(panel).queryByRole('button', { name: 'common.mainNav.workspace.create' }),
    ).not.toBeInTheDocument()
  })

  it('creates a workspace and reloads after a successful submit', async () => {
    const user = userEvent.setup()
    const mockAssign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      assign: mockAssign,
      origin: 'http://localhost',
    })
    mockWorkspacePolicy = allowedCreatePolicy
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.mainNav.workspace.create' }))

    const createDialog = await screen.findByRole('dialog', {
      name: 'common.mainNav.workspace.createTitle',
    })
    await user.type(
      within(createDialog).getByLabelText('common.account.workspaceName'),
      'New Space',
    )
    await user.click(within(createDialog).getByRole('button', { name: 'common.operation.create' }))

    await waitFor(() =>
      expect(mockCreateWorkspace).toHaveBeenCalledWith({ body: { name: 'New Space' } }),
    )
    expect(mockAssign).toHaveBeenCalledWith('http://localhost')
    vi.unstubAllGlobals()
  })

  it('disables create workspace when the license quota is exhausted', async () => {
    mockWorkspacePolicy = exhaustedCreatePolicy
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.create' }),
    ).toBeDisabled()
  })

  it('shows a limit toast when create fails with a stale policy', async () => {
    const user = userEvent.setup()
    mockWorkspacePolicy = allowedCreatePolicy
    mockCreateWorkspace.mockRejectedValue({
      data: { body: { code: 'limit_exceeded' } },
    })
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.mainNav.workspace.create' }))

    const createDialog = await screen.findByRole('dialog', {
      name: 'common.mainNav.workspace.createTitle',
    })
    await user.type(
      within(createDialog).getByLabelText('common.account.workspaceName'),
      'Overflow Space',
    )
    await user.click(within(createDialog).getByRole('button', { name: 'common.operation.create' }))

    await waitFor(() =>
      expect(toastMocks.mockNotify).toHaveBeenCalledWith({
        type: 'error',
        message: 'common.mainNav.workspace.createLimitReached',
      }),
    )
  })

  it('disables archive and leave when only one workspace remains', async () => {
    mockWorkspaces = [
      {
        id: 'workspace-1',
        name: 'Solar Studio',
        plan: 'sandbox',
        status: 'normal',
        created_at: 0,
        current: true,
        is_owner: true,
      },
    ]
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))

    const panel = await screen.findByRole('dialog', { name: 'Solar Studio' })
    expect(
      within(panel).getByRole('button', { name: 'common.mainNav.workspace.archive' }),
    ).toBeDisabled()
  })

  it('archives a workspace after confirm', async () => {
    const user = userEvent.setup()
    const mockAssign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      assign: mockAssign,
      origin: 'http://localhost',
    })
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.mainNav.workspace.archive' }))

    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'common.operation.confirm' }))

    await waitFor(() =>
      expect(mockArchiveWorkspace).toHaveBeenCalledWith({ body: { tenant_id: 'workspace-1' } }),
    )
    expect(mockAssign).toHaveBeenCalledWith('http://localhost')
    vi.unstubAllGlobals()
  })

  it('leaves a non-owned workspace after confirm', async () => {
    const user = userEvent.setup()
    const mockAssign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      assign: mockAssign,
      origin: 'http://localhost',
    })
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.mainNav.workspace.leave' }))

    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'common.operation.confirm' }))

    await waitFor(() =>
      expect(mockLeaveWorkspace).toHaveBeenCalledWith({ body: { tenant_id: 'workspace-2' } }),
    )
    expect(mockAssign).toHaveBeenCalledWith('http://localhost')
    vi.unstubAllGlobals()
  })

  it('restores an archived workspace after confirm', async () => {
    const user = userEvent.setup()
    mockFetchArchivedWorkspaces.mockResolvedValue({
      workspaces: [
        {
          id: 'workspace-9',
          name: 'Old Space',
          plan: 'sandbox',
          status: 'archive',
          created_at: 0,
          current: false,
          is_owner: true,
        },
      ],
    })
    renderWorkspaceCard()

    fireEvent.click(screen.getByRole('button', { name: 'common.mainNav.workspace.openMenu' }))
    expect(await screen.findByText('common.mainNav.workspace.archivedSection')).toBeInTheDocument()
    fireEvent.click(
      await screen.findByRole('button', { name: 'common.mainNav.workspace.unarchive' }),
    )

    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'common.operation.confirm' }))

    await waitFor(() =>
      expect(mockUnarchiveWorkspace).toHaveBeenCalledWith({ body: { tenant_id: 'workspace-9' } }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
