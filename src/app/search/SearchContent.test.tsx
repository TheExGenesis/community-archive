import '@testing-library/jest-dom'
import { URLSearchParams } from 'url'
import { fireEvent, render, screen } from '@testing-library/react'
import { SearchPageContent } from './SearchContent'
import UserMatchResults from '@/components/UserMatchResults'
import RelatedContentResults from '@/components/search/RelatedContentResults'
import UserSearchInput from '@/components/UserSearchInput'

const mockPush = jest.fn()
let mockParams = new URLSearchParams()
const mockTweetList = jest.fn((_props: object) => <div>Tweet results</div>)

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => mockParams,
}))
jest.mock('next/dynamic', () => () => (props: object) => mockTweetList(props))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))
jest.mock('@/components/UserMatchResults', () =>
  jest.fn(() => <div>User results</div>),
)
jest.mock('@/components/search/RelatedContentResults', () =>
  jest.fn(() => <div>Related results</div>),
)
jest.mock('@/components/UserSearchInput', () =>
  jest.fn(() => <input aria-label="User suggestions" />),
)

beforeEach(() => {
  // jsdom's URLSearchParams predates the size property used by the form.
  global.URLSearchParams = URLSearchParams as typeof global.URLSearchParams
  jest.clearAllMocks()
  mockParams = new URLSearchParams('q=open+source&fromUser=alice')
})

test('guests can prepare a search without mounting results or username lookups', () => {
  render(<SearchPageContent canSearch={false} />)
  expect(
    screen.getByRole('heading', { name: 'Log in to search the archive' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Log in to continue' }),
  ).toHaveAttribute(
    'href',
    '/login?redirect=%2Fsearch%3Fq%3Dopen%2Bsource%26fromUser%3Dalice',
  )
  expect(UserMatchResults).not.toHaveBeenCalled()
  expect(RelatedContentResults).not.toHaveBeenCalled()
  expect(mockTweetList).not.toHaveBeenCalled()
  expect(UserSearchInput).not.toHaveBeenCalled()
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search the archive' }),
    {
      target: { value: 'hello from:alice' },
    },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(mockPush).toHaveBeenCalledWith('/search?q=hello&fromUser=alice')
})

test('guests see a login explanation before entering a search', () => {
  mockParams = new URLSearchParams()
  render(<SearchPageContent canSearch={false} />)
  expect(
    screen.getByRole('link', { name: 'Log in to continue' }),
  ).toHaveAttribute('href', '/login?redirect=%2Fsearch')
  expect(mockTweetList).not.toHaveBeenCalled()
})

test('signed-in users retain the full search results and username suggestions', () => {
  render(<SearchPageContent canSearch />)
  expect(UserSearchInput).toHaveBeenCalled()
  expect(UserMatchResults).toHaveBeenCalled()
  expect(RelatedContentResults).toHaveBeenCalled()
  expect(mockTweetList).toHaveBeenCalled()
  expect(
    screen.queryByRole('link', { name: 'Log in to continue' }),
  ).not.toBeInTheDocument()
})
