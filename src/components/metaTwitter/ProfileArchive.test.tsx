import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { archiveChapterHref } from './ArchiveNav'
import { ProfileArchive } from './ProfileArchive'
import { ProfileEditButton } from './ProfileEditButton'
import { ProfileEditingProvider } from './ProfileEditingContext'
import { curatedSectionsByYear } from '@/lib/metaTwitter/chapterSections'
import type { BangerTweet } from '@/lib/metaTwitter/types'
import { mutateProfileCuration } from '@/app/user/[account_id]/actions'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt = '', ...props }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))
jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/ImageLightbox', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="tweet-image" data-src={src} aria-label={alt} />
  ),
}))
jest.mock('@/app/user/[account_id]/actions', () => ({
  mutateProfileCuration: jest.fn(),
}))

const mockMutateProfileCuration = mutateProfileCuration as jest.MockedFunction<
  typeof mutateProfileCuration
>

const banger = (id: number, year: number): BangerTweet => ({
  tweet_id: String(id),
  account_id: '42',
  created_at: `${year}-01-01T00:00:00.000Z`,
  full_text: `Banger ${id}`,
  favorite_count: 20,
  retweet_count: 2,
  reply_to_username: null,
  username: 'alice',
  account_display_name: 'Alice',
  avatar_media_url: null,
  media: [],
  quote_count: 5,
  quoting_accounts: 5,
  quote_tweet_id: null,
  quoted_tweet: null,
})

const chapters = [
  { year: 2025, count: 4 },
  { year: 2024, count: 3 },
]

const initialSidebar = { media: [], mediaCount: 0, people: [] }
const jsonResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response

const deferredResponse = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const renderProfileArchive = (
  archive: ReactElement,
  { withEditButton = false }: { withEditButton?: boolean } = {},
) =>
  render(
    <ProfileEditingProvider>
      {withEditButton ? <ProfileEditButton /> : null}
      {archive}
    </ProfileEditingProvider>,
  )

class TestIntersectionObserver {
  static callbacks: IntersectionObserverCallback[] = []
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  constructor(callback: IntersectionObserverCallback) {
    TestIntersectionObserver.callbacks.push(callback)
  }

  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

beforeEach(() => {
  TestIntersectionObserver.callbacks = []
  window.history.replaceState(null, '', '/user/alice')
  global.IntersectionObserver =
    TestIntersectionObserver as unknown as typeof IntersectionObserver
  mockMutateProfileCuration.mockReset()
  mockMutateProfileCuration.mockResolvedValue({ ok: true })
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('preserves profile identity parameters while changing chapters', () => {
  expect(archiveChapterHref('/user/42?username=alice', 2025)).toBe(
    '/user/42?username=alice&chapter=2025',
  )
  expect(archiveChapterHref('/user/42?username=alice&chapter=2025', null)).toBe(
    '/user/42?username=alice',
  )
})

test('shows owner-only curation controls and persists section edits', async () => {
  const user = userEvent.setup()
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://community-archive.org')
    if (url.pathname.endsWith('/bangers')) {
      return Promise.resolve(
        jsonResponse({
          tweets: [banger(1, 2025), banger(2, 2025)],
          yearCounts: [],
          total: 2,
          nextOffset: null,
          available: true,
        }),
      )
    }
    return Promise.resolve(jsonResponse({ people: [] }))
  })

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025), banger(2, 2025)],
        yearCounts: [],
        total: 2,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={{
        media: [],
        mediaCount: 0,
        people: [
          {
            user_id: '77',
            screen_name: 'bob',
            name: 'Bob',
            interactions: 12,
          },
        ],
      }}
    />,
    { withEditButton: true },
  )

  expect(
    screen.getByRole('link', { name: 'All time', current: 'page' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByRole('button', { name: 'Restore Bangers' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Restore' })).toBeVisible()

  await user.type(
    screen.getByRole('textbox', { name: 'Add one of your archived tweets' }),
    'https://x.com/alice/status/999',
  )
  await user.click(screen.getByRole('button', { name: 'Add to profile' }))
  await waitFor(() =>
    expect(mockMutateProfileCuration).toHaveBeenCalledWith({
      action: 'add',
      accountId: '42',
      section: 'bangers',
      itemId: '999',
    }),
  )

  await user.click(screen.getByRole('button', { name: 'Dismiss banger 1' }))
  await waitFor(() =>
    expect(mockMutateProfileCuration).toHaveBeenCalledWith({
      action: 'dismiss',
      accountId: '42',
      section: 'bangers',
      itemId: '1',
    }),
  )
  expect(screen.queryByText('Banger 1')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() =>
    expect(mockMutateProfileCuration).toHaveBeenCalledWith({
      action: 'restore-item',
      accountId: '42',
      section: 'bangers',
      itemId: '1',
    }),
  )
  await waitFor(() => expect(screen.getByText('Banger 1')).toBeVisible())
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()

  mockMutateProfileCuration.mockResolvedValueOnce({
    ok: true,
    isFeatured: true,
  })
  await user.click(screen.getByRole('button', { name: 'Feature banger 2' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Unfeature banger 2' }),
    ).toHaveAttribute('aria-pressed', 'true'),
  )

  await user.click(screen.getByRole('button', { name: 'Restore' }))
  await waitFor(() =>
    expect(mockMutateProfileCuration).toHaveBeenCalledWith({
      action: 'restore',
      accountId: '42',
      section: 'people',
    }),
  )
  expect(fetchMock).toHaveBeenCalledWith('/api/profile/42/interactions')

  await user.click(screen.getByRole('link', { name: '2025 4' }))
  expect(screen.getByRole('button', { name: 'Edit profile' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /dismiss banger/i }),
  ).not.toBeInTheDocument()
})

test('returns to all time when edit mode starts from a year chapter', async () => {
  const user = userEvent.setup()
  jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://community-archive.org')
    if (url.pathname.endsWith('/bangers')) {
      return Promise.resolve(
        jsonResponse({
          tweets: [banger(1, 2025)],
          yearCounts: chapters,
          total: 1,
          nextOffset: null,
          available: true,
        }),
      )
    }
    if (url.pathname.endsWith('/media')) {
      return Promise.resolve(jsonResponse({ media: [], mediaCount: 0 }))
    }
    return Promise.resolve(jsonResponse({ people: [] }))
  })

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={2025}
      initialPage={{
        tweets: [banger(1, 2025)],
        yearCounts: chapters,
        total: 1,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
    { withEditButton: true },
  )

  expect(
    screen.getByRole('link', { name: '2025 4', current: 'page' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))

  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'All time', current: 'page' }),
    ).toBeVisible(),
  )
  expect(window.location.pathname + window.location.search).toBe('/user/alice')
  expect(screen.getByRole('button', { name: 'Restore Bangers' })).toBeVisible()
})

test('switches chapters immediately while their small data requests are pending', async () => {
  const user = userEvent.setup()
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockImplementation(() => new Promise(() => {}))

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025), banger(2, 2024)],
        yearCounts: chapters,
        total: 7,
        nextOffset: 2,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  expect(screen.getAllByRole('article')).toHaveLength(2)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())

  await user.click(screen.getByRole('link', { name: '2025 4' }))

  expect(window.location.pathname + window.location.search).toBe(
    '/user/alice?chapter=2025',
  )
  expect(screen.getByRole('heading', { name: 'Best of 2025' })).toBeVisible()
  expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1)
  expect(screen.queryByText('Banger 1')).not.toBeInTheDocument()
  expect(screen.getByText('Loading bangers…')).toBeVisible()
  expect(screen.getByText('Loading media…')).toBeVisible()
  expect(screen.getByText('Loading people…')).toBeVisible()
  expect(
    fetchMock.mock.calls.some(([input]) =>
      String(input).includes('/bangers?offset=0&limit=2&sort=quotes&year=2025'),
    ),
  ).toBe(true)
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/media?year=2025'),
      ),
    ).toBe(true),
  )
  expect(
    fetchMock.mock.calls.some(([input]) =>
      String(input).includes('/interactions?year=2025'),
    ),
  ).toBe(true)
})

test('preserves modified-click behavior on chapter links', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockImplementation(() => new Promise(() => {}))
  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025), banger(2, 2024)],
        yearCounts: chapters,
        total: 7,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

  let defaultPrevented: boolean | undefined
  document.addEventListener(
    'click',
    (event) => {
      defaultPrevented = event.defaultPrevented
      event.preventDefault()
    },
    { once: true },
  )
  fireEvent.click(screen.getByRole('link', { name: '2025 4' }), {
    metaKey: true,
  })

  expect(defaultPrevented).toBe(false)
  expect(window.location.pathname + window.location.search).toBe('/user/alice')
  expect(screen.getByRole('heading', { name: 'Best of Alice' })).toBeVisible()
})

test('restores the selected chapter from browser history', async () => {
  const user = userEvent.setup()
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockImplementation(() => new Promise(() => {}))
  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025), banger(2, 2024)],
        yearCounts: chapters,
        total: 7,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

  await user.click(screen.getByRole('link', { name: '2025 4' }))
  window.history.pushState(null, '', '/user/alice?chapter=2024')
  act(() => window.dispatchEvent(new PopStateEvent('popstate')))

  expect(screen.getByRole('heading', { name: 'Best of 2024' })).toBeVisible()
  expect(screen.getByRole('link', { name: '2024 3' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('fills the active feed, preloads shallow chapter pages, and continues at the scroll sentinel', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://community-archive.org')
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const year = url.searchParams.get('year')
    const page = year
      ? {
          tweets: [banger(Number(`${year}1`), Number(year))],
          yearCounts: chapters,
          total: Number(year) === 2025 ? 4 : 3,
          nextOffset: 1,
          available: true,
        }
      : offset === 2
        ? {
            tweets: [banger(3, 2025), banger(4, 2024)],
            yearCounts: chapters,
            total: 5,
            nextOffset: 4,
            available: true,
          }
        : {
            tweets: [banger(5, 2023)],
            yearCounts: chapters,
            total: 5,
            nextOffset: null,
            available: true,
          }
    return Promise.resolve({ ok: true, json: async () => page } as Response)
  })

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025), banger(2, 2024)],
        yearCounts: chapters,
        total: 5,
        nextOffset: 2,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  expect(screen.getAllByRole('article')).toHaveLength(2)
  await screen.findByText('Banger 4')
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('limit=2&sort=quotes&year='),
      ),
    ).toHaveLength(2),
  )

  const callback = TestIntersectionObserver.callbacks.at(-1)
  expect(callback).toBeDefined()
  act(() => {
    callback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })

  await screen.findByText('Banger 5')
  expect(
    fetchMock.mock.calls.some(([input]) =>
      String(input).includes('/bangers?offset=4&limit=10&sort=quotes'),
    ),
  ).toBe(true)
})

test('stops automatic infinite-scroll retries after a failed page', async () => {
  const user = userEvent.setup()
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://community-archive.org')
    if (url.pathname.endsWith('/media')) {
      return Promise.resolve(jsonResponse({ media: [], mediaCount: 0 }))
    }
    if (url.pathname.endsWith('/interactions')) {
      return Promise.resolve(jsonResponse({ people: [] }))
    }
    if (!url.searchParams.has('year')) {
      return Promise.reject(new Error('gateway unavailable'))
    }
    return Promise.resolve(
      jsonResponse({
        tweets: [],
        yearCounts: chapters,
        total: 0,
        nextOffset: null,
        available: true,
      }),
    )
  })

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025), banger(2, 2024)],
        yearCounts: chapters,
        total: 7,
        nextOffset: 2,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  const retry = await screen.findByRole('button', {
    name: 'Retry loading bangers',
  })
  const overallPageCalls = () =>
    fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/bangers?offset=2&limit=10&sort=quotes'),
    ).length

  expect(overallPageCalls()).toBe(1)
  await act(async () => Promise.resolve())
  expect(overallPageCalls()).toBe(1)

  await user.click(retry)
  await waitFor(() => expect(overallPageCalls()).toBe(2))
})

test('can retry an unavailable initial banger page from offset zero', async () => {
  const user = userEvent.setup()
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://community-archive.org')
    if (url.pathname.endsWith('/media')) {
      return Promise.resolve(jsonResponse({ media: [], mediaCount: 0 }))
    }
    if (url.pathname.endsWith('/interactions')) {
      return Promise.resolve(jsonResponse({ people: [] }))
    }
    return Promise.resolve(
      jsonResponse({
        tweets: url.searchParams.has('year') ? [] : [banger(10, 2025)],
        yearCounts: chapters,
        total: url.searchParams.has('year') ? 0 : 1,
        nextOffset: null,
        available: true,
      }),
    )
  })

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [],
        yearCounts: chapters,
        total: 0,
        nextOffset: null,
        available: false,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  await user.click(
    screen.getByRole('button', { name: 'Retry loading bangers' }),
  )

  await screen.findByText('Banger 10')
  expect(
    fetchMock.mock.calls.some(([input]) =>
      String(input).includes('/bangers?offset=0&limit=2&sort=quotes'),
    ),
  ).toBe(true)
})

test('retries failed media without blocking successful interactions', async () => {
  const user = userEvent.setup()
  let mediaCalls = 0
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://community-archive.org')
    if (url.pathname.endsWith('/media')) {
      mediaCalls += 1
      if (mediaCalls === 1) {
        return Promise.reject(new Error('gateway unavailable'))
      }
      return Promise.resolve(jsonResponse({ media: [], mediaCount: 0 }))
    }
    if (url.pathname.endsWith('/interactions')) {
      return Promise.resolve(jsonResponse({ people: [] }))
    }
    return Promise.resolve(
      jsonResponse({
        tweets: [],
        yearCounts: chapters,
        total: 0,
        nextOffset: null,
        available: true,
      }),
    )
  })

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [],
        yearCounts: chapters,
        total: 0,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={{ ...initialSidebar, available: false }}
    />,
  )

  await user.click(await screen.findByRole('button', { name: 'Retry media' }))

  await screen.findByText('No media in this chapter')
  expect(
    screen.getByText('No interactions found in this chapter.'),
  ).toBeVisible()
  expect(mediaCalls).toBe(2)
  expect(fetchMock).toHaveBeenCalled()
})

test('does not start a stale chapter preload over an in-flight active feed', async () => {
  const user = userEvent.setup()
  const overallFill = deferredResponse()
  const activeChapter = deferredResponse()
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://community-archive.org')
    if (url.pathname.endsWith('/media')) {
      return Promise.resolve(jsonResponse({ media: [], mediaCount: 0 }))
    }
    if (url.pathname.endsWith('/interactions')) {
      return Promise.resolve(jsonResponse({ people: [] }))
    }
    const year = url.searchParams.get('year')
    const offset = Number(url.searchParams.get('offset') ?? 0)
    if (!year && offset === 2) return overallFill.promise
    if (year === '2025' && offset === 0) return activeChapter.promise
    return Promise.resolve(
      jsonResponse({
        tweets: [],
        yearCounts: chapters,
        total: year === '2024' ? 3 : 4,
        nextOffset: null,
        available: true,
      }),
    )
  })

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025), banger(2, 2024)],
        yearCounts: chapters,
        total: 7,
        nextOffset: 2,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  await user.click(screen.getByRole('link', { name: '2025 4' }))
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('offset=0&limit=2&sort=quotes&year=2025'),
      ),
    ).toHaveLength(1),
  )

  act(() => {
    overallFill.resolve(
      jsonResponse({
        tweets: [banger(3, 2025)],
        yearCounts: chapters,
        total: 7,
        nextOffset: null,
        available: true,
      }),
    )
  })
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('year=2024'),
      ),
    ).toBe(true),
  )
  expect(
    fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('offset=0&limit=2&sort=quotes&year=2025'),
    ),
  ).toHaveLength(1)

  act(() => {
    activeChapter.resolve(
      jsonResponse({
        tweets: [banger(20251, 2025)],
        yearCounts: chapters,
        total: 4,
        nextOffset: null,
        available: true,
      }),
    )
  })
  await screen.findByText('Banger 20251')
  expect(
    fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('offset=0&limit=2&sort=quotes&year=2025'),
    ),
  ).toHaveLength(1)
})

const CURATED_ACCOUNT_ID = '826134955549790208'
const curatedSections = curatedSectionsByYear(CURATED_ACCOUNT_ID)!

test('opens a chapter subsection and titles the workspace with its quote', async () => {
  const user = userEvent.setup()
  jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
  const [section] = curatedSections[2025]
  const [otherSection] = curatedSections[2024]

  renderProfileArchive(
    <ProfileArchive
      accountId={CURATED_ACCOUNT_ID}
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      sectionsByYear={curatedSections}
      initialYear={2025}
      initialPage={{
        tweets: [banger(1, 2025)],
        yearCounts: chapters,
        total: 1,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  // Every chapter lists its sections, open or not.
  expect(
    screen.getByRole('link', { name: `${otherSection.title}, 2024` }),
  ).toBeVisible()

  await user.click(screen.getByRole('link', { name: `${section.title}, 2025` }))

  expect(window.location.pathname + window.location.search).toBe(
    `/user/alice?chapter=2025&section=${section.slug}`,
  )
  expect(screen.getByRole('heading', { name: section.title })).toBeVisible()
  // One per breakpoint: the compact nav marks the year, the wide nav the
  // section it lists under that year.
  expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(2)

  // A section from another chapter switches chapters with it.
  await user.click(
    screen.getByRole('link', { name: `${otherSection.title}, 2024` }),
  )
  expect(window.location.pathname + window.location.search).toBe(
    `/user/alice?chapter=2024&section=${otherSection.slug}`,
  )
  expect(
    screen.getByRole('heading', { name: otherSection.title }),
  ).toBeVisible()

  // Leaving the chapter drops the section from the URL.
  await user.click(screen.getByRole('link', { name: '2024 3' }))
  expect(window.location.pathname + window.location.search).toBe(
    '/user/alice?chapter=2024',
  )
  expect(screen.getByRole('heading', { name: 'Best of 2024' })).toBeVisible()
})

test('restores a subsection from an initial URL and from browser history', async () => {
  const user = userEvent.setup()
  jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
  const [section] = curatedSections[2025]
  window.history.replaceState(
    null,
    '',
    `/user/alice?chapter=2025&section=${section.slug}`,
  )

  renderProfileArchive(
    <ProfileArchive
      accountId={CURATED_ACCOUNT_ID}
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      sectionsByYear={curatedSections}
      initialYear={2025}
      initialSectionSlug={section.slug}
      initialPage={{
        tweets: [banger(1, 2025)],
        yearCounts: chapters,
        total: 1,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  expect(screen.getByRole('heading', { name: section.title })).toBeVisible()

  await user.click(screen.getByRole('link', { name: '2025 4' }))
  expect(screen.getByRole('heading', { name: 'Best of 2025' })).toBeVisible()

  act(() => {
    window.history.back()
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await waitFor(() =>
    expect(screen.getByRole('heading', { name: section.title })).toBeVisible(),
  )
})

test('filters a chapter down to the selected section, catch-all included', async () => {
  const user = userEvent.setup()
  jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
  const sections = curatedSections[2025]
  const [curated] = sections
  const everythingElse = sections[sections.length - 1]
  const tweets = [
    { ...banger(1, 2025), tweet_id: curated.tweetIds[0], full_text: 'curated' },
    { ...banger(2, 2025), tweet_id: '999', full_text: 'uncurated' },
  ]

  renderProfileArchive(
    <ProfileArchive
      accountId={CURATED_ACCOUNT_ID}
      avatarUrl={null}
      basePath="/user/alice"
      chapters={chapters}
      displayName="Alice"
      sectionsByYear={curatedSections}
      initialYear={2025}
      initialPage={{
        tweets,
        yearCounts: chapters,
        total: tweets.length,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  // The whole chapter until a section narrows it.
  expect(screen.getByText('curated')).toBeVisible()
  expect(screen.getByText('uncurated')).toBeVisible()

  await user.click(screen.getByRole('link', { name: `${curated.title}, 2025` }))
  expect(screen.getByText('curated')).toBeVisible()
  expect(screen.queryByText('uncurated')).not.toBeInTheDocument()

  await user.click(
    screen.getByRole('link', { name: `${everythingElse.title}, 2025` }),
  )
  expect(screen.getByText('uncurated')).toBeVisible()
  expect(screen.queryByText('curated')).not.toBeInTheDocument()
})

test('shows no sections when none are provided', () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))

  renderProfileArchive(
    <ProfileArchive
      accountId="42"
      avatarUrl={null}
      basePath="/user/bob"
      chapters={chapters}
      displayName="Bob"
      initialYear={null}
      initialPage={{
        tweets: [banger(1, 2025)],
        yearCounts: chapters,
        total: 7,
        nextOffset: null,
        available: true,
      }}
      initialSidebar={initialSidebar}
    />,
  )

  // Sectionless chapters stay directly clickable.
  expect(screen.getAllByRole('link', { name: '2025 4' })).not.toHaveLength(0)
})
