import React from 'react'
import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import UserMatchResults from './UserMatchResults'
import {
  fetchAccountSuggestions,
  fetchMemberSuggestions,
} from '@/lib/queries/fetchUsers'

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({}),
}))

jest.mock('@/lib/queries/fetchUsers', () => ({
  fetchAccountSuggestions: jest.fn(),
  fetchMemberSuggestions: jest.fn(),
}))

const accountMatch = {
  account_id: '123',
  directory_id: 'account:123',
  username: 'christineist',
  account_display_name: 'Christine Shiba',
  avatar_media_url: null,
  num_followers: 100,
}

describe('UserMatchResults', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(fetchAccountSuggestions).mockResolvedValue([accountMatch])
    jest.mocked(fetchMemberSuggestions).mockResolvedValue([])
  })

  it('shows possible people for a standalone username-like search', async () => {
    render(<UserMatchResults query="christine" />)

    expect(
      await screen.findByRole('heading', {
        name: 'People matching “christine”',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Christine Shiba/ }),
    ).toHaveAttribute('href', '/user/christineist')
  })

  it('does not run user matching for a topic phrase', () => {
    render(<UserMatchResults query="community archive" />)

    expect(fetchAccountSuggestions).not.toHaveBeenCalled()
    expect(fetchMemberSuggestions).not.toHaveBeenCalled()
  })
  it('clears old people while a different query is loading or fails', async () => {
    const { rerender } = render(<UserMatchResults query="christine" />)
    await screen.findByRole('link', { name: /Christine Shiba/ })
    jest.mocked(fetchAccountSuggestions).mockRejectedValue(new Error('offline'))
    jest.mocked(fetchMemberSuggestions).mockRejectedValue(new Error('offline'))

    await act(async () => rerender(<UserMatchResults query="exgenesis" />))

    expect(
      screen.queryByRole('link', { name: /Christine Shiba/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /People matching/ }),
    ).not.toBeInTheDocument()
  })
})
