import React, { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import UserSearchInput from './UserSearchInput'
import { fetchUserSuggestions } from '@/lib/queries/fetchUsers'

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
    mockedFetchUserSuggestions.mockReset()
  })

  it('offers matching users and inserts a from: filter when selected', async () => {
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

    const option = await screen.findByRole('option', {
      name: /Ex Genesis @exgenesis from:exgenesis/,
    })
    expect(mockedFetchUserSuggestions).toHaveBeenLastCalledWith(
      expect.anything(),
      'exg',
      6,
    )

    await userEvent.click(option)

    expect(input).toHaveValue('from:exgenesis')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports arrow-key selection without submitting the parent form', async () => {
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
    await screen.findByRole('option')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(input).toHaveValue('from:exgenesis')
  })
})
