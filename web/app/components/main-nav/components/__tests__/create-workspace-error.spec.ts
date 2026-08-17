import {
  canCreateFromWorkspacePolicy,
  getCreateWorkspaceErrorCode,
} from '../create-workspace-error'

describe('canCreateFromWorkspacePolicy', () => {
  it('hides create when the deployment does not allow it', () => {
    expect(
      canCreateFromWorkspacePolicy({
        is_allow_create_workspace: false,
        workspaces: { enabled: false, limit: 0, size: 0 },
      }),
    ).toEqual({ visible: false, enabled: false })
  })

  it('enables create when the flag is on and quota is inactive', () => {
    expect(
      canCreateFromWorkspacePolicy({
        is_allow_create_workspace: true,
        workspaces: { enabled: false, limit: 0, size: 0 },
      }),
    ).toEqual({ visible: true, enabled: true })
  })

  it('disables create when the license quota is exhausted', () => {
    expect(
      canCreateFromWorkspacePolicy({
        is_allow_create_workspace: true,
        workspaces: { enabled: true, limit: 2, size: 2 },
      }),
    ).toEqual({ visible: true, enabled: false })
  })
})

describe('getCreateWorkspaceErrorCode', () => {
  it('reads the console error body code', () => {
    expect(
      getCreateWorkspaceErrorCode({
        data: { body: { code: 'limit_exceeded' } },
      }),
    ).toBe('limit_exceeded')
  })

  it('ignores unknown codes', () => {
    expect(getCreateWorkspaceErrorCode({ code: 'unknown' })).toBeNull()
  })
})
