import Link from 'next/link'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  ProfileCard,
  ProfileHoverCard,
  ProfileLink,
  ProfilePeopleContext,
  clearProfilePreviews,
  primeProfilePreviews,
} from './ProfilePreview'
import { clearLoadedAvatars, rememberLoadedAvatar } from '@/lib/loadedAvatars'
import { peopleFromTweets, type Person } from './profileLinks'

jest.mock('@/components/TweetAvatar', () => ({
  TweetAvatar: ({ tweet }: { tweet: { avatar: string | null } }) => (
    <span data-testid="avatar" data-src={tweet.avatar ?? ''} />
  ),
}))

const person: Person = {
  username: 'csgbwk',
  accountId: '42',
  name: 'csgm',
  avatar: null,
  tweetId: '1',
  tweets: 3,
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
  clearLoadedAvatars()
  fetchMock = jest.fn(async () => ({ ok: true, json: async () => preview }))
  global.fetch = fetchMock as unknown as typeof fetch
})

test('the card shows what the run knows at once, then the bio and facts', async () => {
  render(<ProfileCard person={person} href="/user/csgbwk" />)
  expect(screen.getByText('@csgbwk')).toBeInTheDocument()
  expect(
    screen.getByText('3 tweets found for this question'),
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

test('a profile the page already loaded shows complete, with no request', () => {
  primeProfilePreviews([preview])
  render(<ProfileCard person={{ username: 'CSGBWK' }} href="/user/csgbwk" />)
  expect(screen.getByText('building robots')).toBeInTheDocument()
  expect(screen.queryByTestId('profile-loading')).toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('the card reuses the avatar the page already loaded for them', () => {
  rememberLoadedAvatar({ accountId: '42' }, 'https://pbs.twimg.com/fresh.jpg')
  render(
    <ProfileCard
      person={{ ...person, avatar: 'https://pbs.twimg.com/stale.jpg' }}
      href="/user/csgbwk"
    />,
  )
  expect(screen.getByTestId('avatar')).toHaveAttribute(
    'data-src',
    'https://pbs.twimg.com/fresh.jpg',
  )
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

test('any avatar or name can open the card, without its row seeing clicks', () => {
  jest.useFakeTimers()
  window.matchMedia = jest.fn().mockReturnValue({ matches: true })
  primeProfilePreviews([preview])
  const rowClick = jest.fn()
  render(
    <div onClick={rowClick}>
      <ProfileHoverCard person={{ username: 'csgbwk' }} href="/user/csgbwk">
        <Link href="/user/csgbwk">avatar</Link>
      </ProfileHoverCard>
    </div>,
  )
  fireEvent.mouseEnter(screen.getByRole('link', { name: 'avatar' }))
  act(() => {
    jest.advanceTimersByTime(300)
  })
  const bio = screen.getByText('building robots')
  expect(
    screen.getByRole('link', { name: 'Open profile' }),
  ).not.toHaveAttribute('target')
  fireEvent.click(bio)
  expect(rowClick).not.toHaveBeenCalled()
  jest.useRealTimers()
})

test('a card with no bio to add stays shut, and a signed-out page stops asking', async () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: true })
  fetchMock.mockResolvedValue({ ok: false, status: 401 })
  render(
    <>
      <ProfileHoverCard person={person} href="/user/csgbwk">
        <Link href="/user/csgbwk">first</Link>
      </ProfileHoverCard>
      <ProfileHoverCard person={{ username: 'other' }} href="/user/other">
        <Link href="/user/other">second</Link>
      </ProfileHoverCard>
    </>,
  )
  fireEvent.mouseEnter(screen.getByRole('link', { name: 'first' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350))
  })
  expect(screen.queryByText('Open profile')).toBeNull()
  fireEvent.mouseEnter(screen.getByRole('link', { name: 'second' }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350))
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Open profile')).toBeNull()
})

test('a fetched bio opens the card while the pointer stays', async () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: true })
  render(
    <ProfileHoverCard person={person} href="/user/csgbwk">
      <Link href="/user/csgbwk">avatar</Link>
    </ProfileHoverCard>,
  )
  fireEvent.mouseEnter(screen.getByRole('link', { name: 'avatar' }))
  expect(
    await screen.findByText('building robots', {}, { timeout: 1000 }),
  ).toBeInTheDocument()
  expect(screen.queryByTestId('profile-loading')).toBeNull()
})

test('touch screens get no card, just the link', () => {
  jest.useFakeTimers()
  window.matchMedia = jest.fn().mockReturnValue({ matches: false })
  render(
    <ProfileHoverCard person={person} href="/user/csgbwk">
      <Link href="/user/csgbwk">avatar</Link>
    </ProfileHoverCard>,
  )
  fireEvent.mouseEnter(screen.getByRole('link', { name: 'avatar' }))
  act(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(screen.queryByText('Open profile')).toBeNull()
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
  })
})
