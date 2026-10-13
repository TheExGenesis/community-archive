import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  ProfileCard,
  ProfileLink,
  ProfilePeopleContext,
  clearProfilePreviews,
} from './ProfilePreview'
import { peopleFromTweets, type Person } from './profileLinks'

jest.mock('@/components/TweetAvatar', () => ({
  TweetAvatar: () => <span data-testid="avatar" />,
}))

const person: Person = {
  username: 'csgbwk',
  accountId: '42',
  name: 'csgm',
  avatar: null,
  tweetId: '1',
  tweets: 3,
  firstAt: '2023-05-02T00:00:00.000Z',
  lastAt: '2026-09-01T00:00:00.000Z',
}

const preview = {
  accountId: '42',
  username: 'csgbwk',
  displayName: 'csgm',
  bio: 'building robots',
  location: 'Singapore',
  avatar: null,
  tweets: 1200,
  followers: 3400,
  hasArchive: true,
}

let fetchMock: jest.Mock

beforeEach(() => {
  clearProfilePreviews()
  fetchMock = jest.fn(async () => ({ ok: true, json: async () => preview }))
  global.fetch = fetchMock as unknown as typeof fetch
})

test('the card shows what the run knows at once, then the bio and facts', async () => {
  render(<ProfileCard person={person} href="/user/csgbwk" />)
  expect(screen.getByText('@csgbwk')).toBeInTheDocument()
  expect(
    screen.getByText(
      '3 tweets in this answer’s results · May 2023 to Sep 2026',
    ),
  ).toBeInTheDocument()
  expect(screen.getByTestId('profile-loading')).toBeInTheDocument()
  expect(await screen.findByText('building robots')).toBeInTheDocument()
  expect(screen.getByText('Singapore · 3,400 followers')).toBeInTheDocument()
  expect(screen.queryByTestId('profile-loading')).toBeNull()
  expect(screen.getByRole('link', { name: 'Open profile' })).toHaveAttribute(
    'href',
    '/user/csgbwk',
  )
  expect(fetchMock).toHaveBeenCalledWith('/api/profile/42/preview')
})

test('a failed lookup leaves the instant part, and is not retried', async () => {
  fetchMock.mockResolvedValue({ ok: false })
  const { unmount } = render(
    <ProfileCard person={person} href="/user/csgbwk" />,
  )
  await waitFor(() =>
    expect(screen.queryByTestId('profile-loading')).toBeNull(),
  )
  expect(screen.getByText('csgm')).toBeInTheDocument()
  unmount()
  render(<ProfileCard person={person} href="/user/csgbwk" />)
  await waitFor(() =>
    expect(screen.queryByTestId('profile-loading')).toBeNull(),
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('hovering a known handle opens the card after a pause', async () => {
  jest.useFakeTimers()
  window.matchMedia = jest.fn().mockReturnValue({ matches: true })
  render(
    <ProfilePeopleContext.Provider value={new Map([['csgbwk', person]])}>
      <ProfileLink href="/user/csgbwk">@csgbwk</ProfileLink>
    </ProfilePeopleContext.Provider>,
  )
  fireEvent.mouseEnter(screen.getByRole('link', { name: '@csgbwk' }))
  expect(screen.queryByText('Open profile')).toBeNull()
  act(() => {
    jest.advanceTimersByTime(300)
  })
  expect(screen.getByText('Open profile')).toBeInTheDocument()
  jest.useRealTimers()
})

test('people are counted once per tweet, with their date range', () => {
  const tweet = (id: string, username: string, createdAt: string) =>
    ({
      id,
      username,
      name: username,
      avatar: null,
      createdAt,
      text: '',
    }) as never
  const people = peopleFromTweets([
    [tweet('1', 'Alice', '2024-01-01T00:00:00Z')],
    [
      tweet('1', 'Alice', '2024-01-01T00:00:00Z'),
      tweet('2', 'alice', '2025-06-01T00:00:00Z'),
    ],
  ])
  expect(people.get('alice')).toMatchObject({
    username: 'Alice',
    tweets: 2,
    firstAt: '2024-01-01T00:00:00Z',
    lastAt: '2025-06-01T00:00:00Z',
  })
})
