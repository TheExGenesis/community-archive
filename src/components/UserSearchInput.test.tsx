import React, { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import UserSearchInput from './UserSearchInput'
import { fetchUserSuggestions } from '@/lib/queries/fetchUsers'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({}),
}))

jest.mock('@/lib/queries/fetchUsers', () => ({
  fetchUserSuggestions: jest.fn(),
}))

const mockedFetchUserSuggestions = fetchUserSuggestions as jest.MockedFunction<
  typeof fetchUserSuggestions
>

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

describe('UserSearchInput', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockedFetchUserSuggestions.mockReset()
  })

  it('offers a profile row before a from: filter row', async () => {
    mockedFetchUserSuggestions.mockResolvedValue([
      {
        directory_id: 'archive:123',
        username: 'exgenesis',
        account_display_name: 'Ex Genesis',
        avatar_media_url: null,
        num_followers: 100,
      },
    ])

    render(<SearchHarness />)
    const input = screen.getByRole('combobox', {
      name: 'Search Community Archive',
    })
    await userEvent.type(input, 'exg')

    const options = await screen.findAllByRole('option')
    expect(mockedFetchUserSuggestions).toHaveBeenLastCalledWith(
      expect.anything(),
      'exg',
      6,
    )
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
    mockedFetchUserSuggestions.mockResolvedValue([
      {
        directory_id: 'archive:123',
        username: 'exgenesis',
        account_display_name: 'Ex Genesis',
        avatar_media_url: null,
        num_followers: 100,
      },
    ])

    render(<SearchHarness />)
    const input = screen.getByRole('combobox', {
      name: 'Search Community Archive',
    })
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
    mockedFetchUserSuggestions.mockResolvedValue([
      {
        directory_id: 'archive:123',
        username: 'exgenesis',
        account_display_name: 'Ex Genesis',
        avatar_media_url: null,
        num_followers: 100,
      },
    ])

    render(<SearchHarness />)
    const input = screen.getByRole('combobox', {
      name: 'Search Community Archive',
    })
    await userEvent.type(input, 'exg')
    await screen.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(mockPush).toHaveBeenCalledWith('/user/exgenesis')
    expect(input).toHaveValue('exg')

    input.focus()
    await userEvent.clear(input)
    await userEvent.type(input, 'exg')
    await screen.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(input).toHaveValue('from:exgenesis')
  })
})
