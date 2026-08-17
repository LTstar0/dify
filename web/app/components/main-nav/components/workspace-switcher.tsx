'use client'

import type { TenantListItemResponse } from '@dify/contracts/api/console/workspaces/types.gen'
import { cn } from '@langgenius/dify-ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuTrigger,
} from '@langgenius/dify-ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@langgenius/dify-ui/tooltip'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchInput } from '@/app/components/base/search-input'
import { WorkspaceAvatar } from '@/app/components/base/workspace-avatar'
import { WorkspaceMenuItemContent } from './workspace-menu-content'

const workspaceSwitchActionButtonClassName =
  'flex shrink-0 items-center justify-center rounded-md p-0.5 text-text-tertiary outline-hidden hover:bg-state-base-hover hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-state-accent-solid disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-transparent disabled:hover:text-text-disabled'
const workspaceSwitchActionIconWrapClassName = 'flex size-5 shrink-0 items-center justify-center'
const workspaceSwitchActionIconClassName = 'size-3.5 shrink-0'
const workspaceSwitchListClassName = 'max-h-[240px] overflow-y-auto overscroll-contain scroll-py-1'
const workspaceSwitchI18nKey = (key: string) => key as 'mainNav.workspace.settings'
type WorkspaceSort = 'lastOpened' | 'createdAt'

const getWorkspaceName = (workspace: TenantListItemResponse) => workspace.name || workspace.id
const getWorkspaceCreatedAt = (workspace: TenantListItemResponse) => workspace.created_at ?? 0
const getWorkspaceLastOpenedAt = (workspace: TenantListItemResponse) =>
  workspace.last_opened_at ?? 0

function WorkspaceSwitchControls({
  disabled,
  searchText,
  sort,
  onSearchTextChange,
  onSortChange,
}: {
  disabled: boolean
  searchText: string
  sort: WorkspaceSort
  onSearchTextChange: (value: string) => void
  onSortChange: (value: WorkspaceSort) => void
}) {
  const { t } = useTranslation()
  const [searchVisible, setSearchVisible] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuLabel = t(($) => $[workspaceSwitchI18nKey('mainNav.workspace.sort.openMenu')], {
    ns: 'common',
  })
  const sortOptions: Array<{ value: WorkspaceSort; label: string }> = [
    {
      value: 'lastOpened',
      label: t(($) => $[workspaceSwitchI18nKey('mainNav.workspace.sort.lastOpened')], {
        ns: 'common',
      }),
    },
    {
      value: 'createdAt',
      label: t(($) => $[workspaceSwitchI18nKey('mainNav.workspace.sort.createdTime')], {
        ns: 'common',
      }),
    },
  ]

  return (
    <>
      <div className="flex items-start gap-0.5 py-1 pr-2 pl-3">
        <div className="flex min-w-0 flex-1 items-center justify-center py-1">
          <span className="min-w-0 flex-1 truncate system-xs-medium-uppercase text-text-tertiary">
            {t(($) => $['userProfile.workspace'], { ns: 'common' })}
          </span>
        </div>
        <DropdownMenu open={sortMenuOpen} onOpenChange={setSortMenuOpen}>
          <DropdownMenuTrigger
            aria-label={sortMenuLabel}
            disabled={disabled}
            className={cn(
              workspaceSwitchActionButtonClassName,
              'data-popup-open:bg-state-base-hover data-popup-open:text-text-secondary',
            )}
          >
            <span aria-hidden className={workspaceSwitchActionIconWrapClassName}>
              <span className={cn('i-ri-sort-desc', workspaceSwitchActionIconClassName)} />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            placement="bottom-end"
            sideOffset={4}
            popupClassName="w-40 bg-components-panel-bg-blur! p-1! backdrop-blur-[5px]"
          >
            <DropdownMenuRadioGroup<WorkspaceSort>
              value={sort}
              onValueChange={(value) => {
                onSortChange(value)
                setSortMenuOpen(false)
              }}
            >
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem<WorkspaceSort>
                  key={option.value}
                  value={option.value}
                  className="mx-0 h-8 gap-1 px-2 py-1"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <DropdownMenuRadioItemIndicator className="ml-0" />
                  </span>
                  <span className="min-w-0 flex-1 truncate px-1 system-md-regular text-text-secondary">
                    {option.label}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label={t(($) => $['operation.search'], { ns: 'common' })}
          disabled={disabled}
          className={cn(
            workspaceSwitchActionButtonClassName,
            searchVisible && 'bg-state-base-hover text-text-secondary',
          )}
          onClick={() => setSearchVisible((visible) => !visible)}
        >
          <span aria-hidden className={workspaceSwitchActionIconWrapClassName}>
            <span className={cn('i-ri-search-line', workspaceSwitchActionIconClassName)} />
          </span>
        </button>
      </div>
      {searchVisible && (
        <div className="px-2 pb-2">
          <SearchInput
            value={searchText}
            onValueChange={onSearchTextChange}
            placeholder={t(
              ($) => $[workspaceSwitchI18nKey('mainNav.workspace.searchPlaceholder')],
              { ns: 'common' },
            )}
            autoFocus
          />
        </div>
      )}
    </>
  )
}

type WorkspaceSwitcherProps = {
  workspaces?: TenantListItemResponse[]
  archivedWorkspaces?: TenantListItemResponse[]
  isPending: boolean
  showCreate?: boolean
  createDisabled?: boolean
  onSwitchWorkspace: (workspaceId: string) => void
  onCreateWorkspace?: () => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onLeaveWorkspace?: (workspaceId: string) => void
  onUnarchiveWorkspace?: (workspaceId: string) => void
}

function CreateWorkspaceButton({
  disabled,
  onCreateWorkspace,
}: {
  disabled: boolean
  onCreateWorkspace?: () => void
}) {
  const { t } = useTranslation()
  const createLabel = t(($) => $['mainNav.workspace.create'], { ns: 'common' })
  const limitReachedLabel = t(($) => $['mainNav.workspace.createLimitReached'], { ns: 'common' })
  const button = (
    <button
      type="button"
      aria-label={createLabel}
      disabled={disabled}
      className={cn(
        'flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1 text-left outline-hidden hover:bg-state-base-hover focus-visible:inset-ring-2 focus-visible:inset-ring-state-accent-solid',
        disabled && 'cursor-not-allowed text-text-disabled hover:bg-transparent',
      )}
      onClick={() => {
        if (!disabled) onCreateWorkspace?.()
      }}
    >
      <WorkspaceMenuItemContent
        icon={<span aria-hidden className="i-ri-add-line h-4 w-4" />}
        label={createLabel}
      />
    </button>
  )

  if (!disabled) return button

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block w-full" />} className="w-full">
        {button}
      </TooltipTrigger>
      <TooltipContent>{limitReachedLabel}</TooltipContent>
    </Tooltip>
  )
}

function WorkspaceLifecycleActionButton({
  isOwner,
  disabled,
  onArchiveWorkspace,
  onLeaveWorkspace,
}: {
  isOwner: boolean
  disabled: boolean
  onArchiveWorkspace?: () => void
  onLeaveWorkspace?: () => void
}) {
  const { t } = useTranslation()
  const label = isOwner
    ? t(($) => $['mainNav.workspace.archive'], { ns: 'common' })
    : t(($) => $['mainNav.workspace.leave'], { ns: 'common' })
  const disabledLabel = t(($) => $['mainNav.workspace.lastWorkspaceDisabled'], { ns: 'common' })
  const button = (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        workspaceSwitchActionButtonClassName,
        disabled && 'cursor-not-allowed text-text-disabled hover:bg-transparent',
      )}
      onClick={(event) => {
        event.stopPropagation()
        if (disabled) return
        if (isOwner) onArchiveWorkspace?.()
        else onLeaveWorkspace?.()
      }}
    >
      <span aria-hidden className={workspaceSwitchActionIconWrapClassName}>
        <span
          className={cn(
            isOwner ? 'i-ri-archive-line' : 'i-ri-logout-box-r-line',
            workspaceSwitchActionIconClassName,
          )}
        />
      </span>
    </button>
  )

  if (!disabled) return button

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger>
      <TooltipContent>{disabledLabel}</TooltipContent>
    </Tooltip>
  )
}

export function WorkspaceSwitcher({
  workspaces,
  archivedWorkspaces,
  isPending,
  showCreate = false,
  createDisabled = false,
  onSwitchWorkspace,
  onCreateWorkspace,
  onArchiveWorkspace,
  onLeaveWorkspace,
  onUnarchiveWorkspace,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation()
  const [workspaceSearchText, setWorkspaceSearchText] = useState('')
  const [workspaceSort, setWorkspaceSort] = useState<WorkspaceSort>('lastOpened')
  const displayedWorkspaces = useMemo(() => {
    const normalizedSearchText = workspaceSearchText.trim().toLowerCase()
    const filteredWorkspaces = normalizedSearchText
      ? (workspaces?.filter((workspace) =>
          getWorkspaceName(workspace).toLowerCase().includes(normalizedSearchText),
        ) ?? [])
      : [...(workspaces ?? [])]

    if (workspaceSort === 'createdAt')
      return filteredWorkspaces.sort((a, b) => getWorkspaceCreatedAt(b) - getWorkspaceCreatedAt(a))

    return filteredWorkspaces.sort((a, b) => {
      return (
        getWorkspaceLastOpenedAt(b) - getWorkspaceLastOpenedAt(a) ||
        getWorkspaceCreatedAt(b) - getWorkspaceCreatedAt(a)
      )
    })
  }, [workspaceSearchText, workspaceSort, workspaces])

  if (!isPending && !workspaces) return null

  const isLastWorkspace = (workspaces?.length ?? 0) === 1

  return (
    <div className="p-1 pb-2">
      <WorkspaceSwitchControls
        disabled={isPending}
        searchText={workspaceSearchText}
        sort={workspaceSort}
        onSearchTextChange={setWorkspaceSearchText}
        onSortChange={setWorkspaceSort}
      />
      <div aria-busy={isPending} className={workspaceSwitchListClassName}>
        {isPending ? (
          <div aria-hidden className="flex h-8 items-center justify-center">
            <span className="i-ri-loader-2-line size-4 animate-spin text-text-tertiary motion-reduce:animate-none" />
          </div>
        ) : (
          displayedWorkspaces.map((workspace) => {
            const workspaceName = getWorkspaceName(workspace)

            return (
              <div
                key={workspace.id}
                className={cn(
                  'flex h-8 w-full items-center rounded-lg hover:bg-state-base-hover',
                  workspace.current && 'bg-state-base-hover',
                )}
              >
                <button
                  type="button"
                  aria-current={workspace.current ? 'true' : undefined}
                  title={workspaceName}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-1 text-left outline-hidden focus-visible:inset-ring-2 focus-visible:inset-ring-state-accent-solid"
                  onClick={() => {
                    onSwitchWorkspace(workspace.id)
                  }}
                >
                  <WorkspaceMenuItemContent
                    icon={<WorkspaceAvatar name={workspaceName} size="xs" />}
                    label={workspaceName}
                    trailing={
                      workspace.current ? (
                        <span aria-hidden className="i-ri-check-line h-4 w-4 text-text-accent" />
                      ) : undefined
                    }
                  />
                </button>
                <div className="pr-1">
                  <WorkspaceLifecycleActionButton
                    isOwner={workspace.is_owner === true}
                    disabled={isPending || isLastWorkspace}
                    onArchiveWorkspace={() => onArchiveWorkspace?.(workspace.id)}
                    onLeaveWorkspace={() => onLeaveWorkspace?.(workspace.id)}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
      {(archivedWorkspaces?.length ?? 0) > 0 && (
        <div className="border-t border-divider-subtle pt-1">
          <div className="px-3 py-1 system-xs-medium-uppercase text-text-tertiary">
            {t(($) => $['mainNav.workspace.archivedSection'], { ns: 'common' })}
          </div>
          {archivedWorkspaces?.map((workspace) => {
            const workspaceName = getWorkspaceName(workspace)
            return (
              <div key={workspace.id} className="flex h-8 w-full items-center rounded-lg">
                <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1">
                  <WorkspaceMenuItemContent
                    icon={<WorkspaceAvatar name={workspaceName} size="xs" />}
                    label={workspaceName}
                  />
                </div>
                {workspace.is_owner === true && (
                  <div className="pr-1">
                    <button
                      type="button"
                      aria-label={t(($) => $['mainNav.workspace.unarchive'], { ns: 'common' })}
                      disabled={isPending}
                      className={workspaceSwitchActionButtonClassName}
                      onClick={() => onUnarchiveWorkspace?.(workspace.id)}
                    >
                      <span aria-hidden className={workspaceSwitchActionIconWrapClassName}>
                        <span
                          className={cn('i-ri-reset-left-line', workspaceSwitchActionIconClassName)}
                        />
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {showCreate && (
        <div className="border-t border-divider-subtle pt-1">
          <CreateWorkspaceButton
            disabled={isPending || createDisabled}
            onCreateWorkspace={onCreateWorkspace}
          />
        </div>
      )}
    </div>
  )
}
