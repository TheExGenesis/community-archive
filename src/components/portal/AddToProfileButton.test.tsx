import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AddToProfileButton,
  resetViewerAccountForTests,
} from './AddToProfileButton'
import { addTweetToOwnProfile } from '@/app/user/[account_id]/actions'

const mockGetUser = jest.fn()

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({ auth: { getUser: mockGetUser } }),
}))
jest.mock('@/app/user/[account_id]/actions', () => ({
  addTweetToOwnProfile: jest.fn(),
}))

const mockAddTweet = addTweetToOwnProfile as jest.MockedFunction<
  typeof addTweetToOwnProfile
>

beforeEach(() => {
  jest.clearAllMocks()
  resetViewerAccountForTests()
  mockAddTweet.mockResolvedValue({ ok: true, accountId: '42' })
})

test('lets the signed-in author add a tweet to their profile', async () => {
  const user = userEvent.setup()
  mockGetUser.mockResolvedValue({
    data: { user: { app_metadata: { provider_id: '42' } } },
  })

  render(<AddToProfileButton tweetId="100" accountId="42" />)

  const button = await screen.findByRole('button', { name: 'Add to profile' })
  await user.click(button)

  expect(mockAddTweet).toHaveBeenCalledWith('100')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Added to profile' }),
    ).toBeDisabled(),
  )
})

test('does not expose the action on someone elses tweet', async () => {
  mockGetUser.mockResolvedValue({
    data: { user: { app_metadata: { provider_id: '41' } } },
  })

  render(<AddToProfileButton tweetId="100" accountId="42" />)

  await waitFor(() => expect(mockGetUser).toHaveBeenCalled())
  expect(
    screen.queryByRole('button', { name: 'Add to profile' }),
  ).not.toBeInTheDocument()
})
