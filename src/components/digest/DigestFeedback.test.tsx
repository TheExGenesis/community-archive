import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DigestFeedback } from './DigestFeedback'

const mockGetUser = jest.fn()
const mockMaybeSingle = jest.fn()
const mockUpsert = jest.fn()

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
      upsert: mockUpsert,
    }),
  }),
}))

describe('DigestFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('saves one signed-in member response for the edition', async () => {
    const interaction = userEvent.setup()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockUpsert.mockResolvedValue({ error: null })

    render(
      <DigestFeedback
        digestDate="2026-08-14"
        editionId="11111111-1111-4111-8111-111111111111"
      />,
    )

    await interaction.click(
      await screen.findByRole('button', { name: 'Helpful' }),
    )
    await interaction.type(
      screen.getByLabelText(/What should we improve/i),
      'More context around the second story.',
    )
    await interaction.click(
      screen.getByRole('button', { name: 'Save feedback' }),
    )

    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          edition_id: '11111111-1111-4111-8111-111111111111',
          user_id: 'user-1',
          sentiment: 'helpful',
          comment: 'More context around the second story.',
        }),
        { onConflict: 'edition_id,user_id' },
      ),
    )
    expect(screen.getByText('Thanks — your feedback was saved.')).toBeVisible()
  })

  it('invites signed-out readers to authenticate', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    render(
      <DigestFeedback
        digestDate="2026-08-14"
        editionId="11111111-1111-4111-8111-111111111111"
      />,
    )

    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/login?redirect=%2Fdigest%2F2026-08-14')
  })
})
