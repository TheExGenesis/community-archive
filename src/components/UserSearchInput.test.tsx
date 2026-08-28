import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import UserSearchInput from './UserSearchInput'
import {
  fetchAccountSuggestions,
  fetchMemberSuggestions,
} from '@/lib/queries/fetchUsers'
import type { UserSuggestion } from '@/lib/searchSuggestions'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({}),
}))

jest.mock('@/lib/queries/fetchUsers', () => ({
  fetchAccountSuggestions: jest.fn(),
  fetchMemberSuggestions: jest.fn(),
}))

const mockedFetchAccountSuggestions =
  fetchAccountSuggestions as jest.MockedFunction<typeof fetchAccountSuggestions>
const mockedFetchMemberSuggestions =
  fetchMemberSuggestions as jest.MockedFunction<typeof fetchMemberSuggestions>

const suggestion = (
  username: string,
  accountId: string | null = '123',
): UserSuggestion => ({
  account_id: accountId,
  directory_id: accountId ? `archive:${accountId}` : `optin:${username}`,
  username,
  account_display_name: username === 'exgenesis' ? 'Ex Genesis' : username,
  avatar_media_url: null,
  num_followers: 100,
})

const memberSuggestion = suggestion('exgenesis')

function SearchHarness() {
  const [value, setValue] = useState('')

  return (
    <div className="relative">
      <UserSearchInput
        aria-label="Search Community Archive"
        value={value}
        onValueChange={setValue}
      />
    </div>
  )
}

const renderSearch = () => {
  render(<SearchHarness />)
  return screen.getByRole('combobox', {
    name: 'Search Community Archive',
  })
}

const setDefaultSuggestions = () => {
  mockedFetchMemberSuggestions.mockResolvedValue([memberSuggestion])
  mockedFetchAccountSuggestions.mockResolvedValue([])
}

describe('UserSearchInput', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockedFetchAccountSuggestions.mockReset()
    mockedFetchMemberSuggestions.mockReset()
  })

  it('offers a profile row before a from: filter row', async () => {
    setDefaultSuggestions()
    const input = renderSearch()
    await userEvent.type(input, 'exg')

    const options = await screen.findAllByRole('option')
    expect(mockedFetchMemberSuggestions).toHaveBeenLastCalledWith('exg', 6)
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAccessibleName(/Ex Genesis @exgenesis Profile/)
    expect(options[1]).toHaveAccessibleName(
      /Search posts from @exgenesis from:exgenesis/,
    )

    await userEvent.click(options[0])

    expect(mockPush).toHaveBeenCalledWith('/user/exgenesis')
    expect(input).toHaveValue('exg')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('inserts a from: filter when the filter row is selected', async () => {
    setDefaultSuggestions()
    const input = renderSearch()
    await userEvent.type(input, 'exg')

    const filterOption = await screen.findByRole('option', {
      name: /Search posts from @exgenesis from:exgenesis/,
    })

    await userEvent.click(filterOption)

    expect(input).toHaveValue('from:exgenesis')
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports arrow-key selection for both actions', async () => {
    setDefaultSuggestions()
    const input = renderSearch()
    await userEvent.type(input, 'exg')
    await screen.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(mockPush).toHaveBeenCalledWith('/user/exgenesis')
    expect(input).toHaveValue('exg')

    await userEvent.click(input)
    await userEvent.clear(input)
    await userEvent.type(input, 'exg')
    await screen.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(input).toHaveValue('from:exgenesis')
  })

  it('debounces typing before starting the member lookup', async () => {
    setDefaultSuggestions()
    const input = renderSearch()

    fireEvent.focus(input)
    fireEvent.change(input, {
      target: { value: 'exg', selectionStart: 3 },
    })
    expect(mockedFetchMemberSuggestions).not.toHaveBeenCalled()
    expect(mockedFetchAccountSuggestions).not.toHaveBeenCalled()

    await waitFor(() =>
      expect(mockedFetchMemberSuggestions).toHaveBeenCalledTimes(1),
    )
  })

  it('shows member matches before filling open slots from all accounts', async () => {
    let resolveAccounts!: (users: UserSuggestion[]) => void
    mockedFetchMemberSuggestions.mockResolvedValue([memberSuggestion])
    mockedFetchAccountSuggestions.mockReturnValue(
      new Promise((resolve) => {
        resolveAccounts = resolve
      }),
    )
    const input = renderSearch()

    await userEvent.type(input, 'exg')
    expect(
      await screen.findByRole('option', {
        name: /Ex Genesis @exgenesis Profile/,
      }),
    ).toBeInTheDocument()
    expect(mockedFetchAccountSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      'exg',
      6,
    )
    expect(screen.queryByText('@exg_other')).not.toBeInTheDocument()

    resolveAccounts([suggestion('exg_other', '456')])

    expect(await screen.findByText('@exg_other')).toBeInTheDocument()
    const groups = screen.getAllByRole('group')
    expect(groups[0]).toHaveAccessibleName('@exgenesis')
    expect(groups[1]).toHaveAccessibleName('@exg_other')
  })

  it('skips the broader lookup when members fill the suggestion list', async () => {
    mockedFetchMemberSuggestions.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        suggestion(`exg_member_${index}`, String(index + 1)),
      ),
    )
    mockedFetchAccountSuggestions.mockResolvedValue([])
    const input = renderSearch()

    await userEvent.type(input, 'exg')
    expect(await screen.findAllByRole('group')).toHaveLength(6)
    expect(mockedFetchAccountSuggestions).not.toHaveBeenCalled()
  })
})
