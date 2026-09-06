import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import DigestPage from '@/app/digest/page'
import CommunityPage from '@/app/community/page'
import StreamPage from '@/app/stream/page'
import TrendsPage from '@/app/trends/page'
import { PublishedDigestView } from '@/components/digest/PublishedDigestView'
import { DigestEditionView } from '@/components/digest/DigestEditionView'
import { GallerySession } from '@/components/community/GallerySession'
import { StreamFeed } from '@/components/portal/StreamFeed'
import {
  getPublishedDigest,
  listPublishedDigestDays,
  getDigestLikeState,
} from '@/lib/digest/data'
import { getCurrentUser, getIsMember } from '@/lib/portal/auth'
import { loadPublishedCommunityProjects } from '@/lib/communityProjectDatabase'
import { getPortalTrendSnapshot, startStreamData } from '@/lib/portal/data'
import { AUGUST_11_MOCK_DIGEST } from '@/lib/digest/mock'

jest.mock('@/lib/digest/data', () => ({
  getPublishedDigest: jest.fn(),
  listPublishedDigestDays: jest.fn(),
  getDigestLikeState: jest.fn(),
  getDigestCommentCount: jest.fn(),
}))
jest.mock('@/lib/portal/auth', () => ({
  getCurrentUser: jest.fn(),
  getIsMember: jest.fn(),
}))
jest.mock('@/app/admin/data', () => ({ checkIsAdmin: jest.fn() }))
jest.mock('@/lib/communityProjectDatabase', () => ({
  loadPublishedCommunityProjects: jest.fn(),
  loadCommunityProjectLikesForUser: jest.fn(),
}))
jest.mock('@/lib/portal/data', () => ({
  startStreamData: jest.fn(),
  getPortalTrendSnapshot: jest.fn(),
  loadPortalComponentData: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('redirect')
  },
}))

jest.mock('@/components/digest/DigestMarkdown', () => ({
  DigestMarkdown: () => null,
}))

const pending = new Promise<never>(() => {})
function find(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
): ReactElement | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined
  if (predicate(node)) return node
  for (const child of Children.toArray(node.props.children)) {
    const result = find(child, predicate)
    if (result) return result
  }
}
beforeEach(() => jest.clearAllMocks())

test('published article is available while calendar and viewer reads remain pending', async () => {
  jest.mocked(getPublishedDigest).mockResolvedValue(AUGUST_11_MOCK_DIGEST)
  jest.mocked(listPublishedDigestDays).mockReturnValue(pending)
  jest.mocked(getCurrentUser).mockReturnValue(pending)
  const page = await DigestPage()
  expect(page.type).toBe(PublishedDigestView)
  const view = PublishedDigestView(page.props)
  const article = find(view, (node) => node.type === DigestEditionView)!
  expect(article.props.edition.content).toBe(AUGUST_11_MOCK_DIGEST.content)
  expect(getDigestLikeState).not.toHaveBeenCalled()
  expect(getCurrentUser).not.toHaveBeenCalled()
})

test('gallery catalog does not wait for viewer authentication', async () => {
  jest.mocked(getCurrentUser).mockReturnValue(pending)
  jest.mocked(loadPublishedCommunityProjects).mockResolvedValue([])
  const page = await CommunityPage()
  expect(page.type).toBe(GallerySession)
  expect(page.props.projects).toEqual([])
})

test('live tweets resolve while optional corpus totals remain pending', async () => {
  jest.mocked(startStreamData).mockReturnValue({
    tweets: Promise.resolve({ data: [], failed: false }),
    stats: pending,
  })
  const page = StreamPage()
  const feed = find(
    page,
    (node) =>
      node.props.result ===
      jest.mocked(startStreamData).mock.results[0].value.tweets,
  )!
  const result = await (feed.type as Function)(feed.props)
  expect(result.type).toBe(StreamFeed)
  expect(result.props.failed).toBe(false)
})

test('signed-out Trends still redirects before requesting analytical data', async () => {
  jest.mocked(getIsMember).mockResolvedValue(false)
  await expect(TrendsPage({})).rejects.toThrow('redirect')
  expect(getPortalTrendSnapshot).not.toHaveBeenCalled()
})
