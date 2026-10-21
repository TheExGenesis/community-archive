import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import SelectionFeed from './SelectionFeed'
import StoryPanel from './StoryPanel'
import { useMapFeed } from './useMapFeed'
import type { HexSnapshot } from '@/lib/hexMap/types'

jest.mock('./hero.module.css', () => ({}))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('./StoryCard', () => ({
  __esModule: true,
  default: ({ story }: { story: { id: string } }) => <p>{story.id}</p>,
}))
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: undefined }),
  useQueryClient: () => ({}),
}))
jest.mock('./useMapFeed', () => ({
  ...jest.requireActual('./useMapFeed'),
  useMapFeed: jest.fn(),
  prefetchMapFeed: jest.fn(),
}))
const empty = {
  stories: [],
  editions: [],
  countryFallback: true,
  nextOffset: 2,
}
const load = jest.fn()
const base = {
  isPending: false,
  isError: false,
  isSuccess: true,
  isFetching: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: load,
  refetch: jest.fn(),
}
let result: Record<string, unknown>
const noop = () => {}
beforeEach(() => {
  jest.clearAllMocks()
  result = { ...base, data: { pages: [empty] } }
  jest.mocked(useMapFeed).mockImplementation(
    (path) =>
      (path.startsWith('stories?')
        ? result
        : {
            ...base,
            hasNextPage: false,
            data: { pages: [{ tweets: [] }] },
          }) as unknown as ReturnType<typeof useMapFeed>,
  )
})
function Feed() {
  return (
    <SelectionFeed
      snapshot={null}
      cells={[0]}
      tab="Stories"
      onOpen={noop}
      onHover={noop}
      onTweetHover={noop}
    />
  )
}
it('does not add country headings for empty pages or repeated retries; labels actual fallback content once', () => {
  const { rerender } = render(<Feed />)
  expect(screen.queryByText('From the same country')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  expect(load).toHaveBeenCalledTimes(1)
  result = {
    ...base,
    isFetchNextPageError: true,
    data: { pages: [empty, empty] },
  }
  rerender(<Feed />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading more' }))
  expect(screen.queryByText('From the same country')).not.toBeInTheDocument()
  result = {
    ...base,
    hasNextPage: false,
    data: {
      pages: [
        empty,
        { ...empty, stories: [{ id: 'first' }] },
        { ...empty, stories: [{ id: 'second' }] },
      ],
    },
  }
  rerender(<Feed />)
  expect(screen.getAllByText('From the same country')).toHaveLength(1)
  expect(screen.getByText('first')).toBeInTheDocument()
  expect(screen.getByText('second')).toBeInTheDocument()
})
const snapshot = {
  cells: [{ accounts: 10, archived: 2, region: 1 }],
  regions: [{ id: 1, name: 'Test community', terms: [] }],
} as unknown as HexSnapshot
function Panel() {
  const [tab, setTab] = useState('Stories')
  return (
    <StoryPanel
      snapshot={snapshot}
      coverageLive
      selected={[0]}
      selectionTab={tab}
      onSelectionTab={setTab}
      onClear={noop}
      open={null}
      onOpen={noop}
      onHover={noop}
      onTweetHover={noop}
    />
  )
}
it('defaults an empty digest to Best but lets the user return to Digest', () => {
  render(<Panel />)
  expect(screen.getAllByRole('tab').map((el) => el.textContent)).toEqual([
    'Digest',
    'Best',
    'Latest',
    'Most liked',
    'Strands',
  ])
  expect(screen.getByRole('tab', { name: 'Best' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Digest' }))
  expect(screen.getByRole('tab', { name: 'Digest' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(
    screen.getByText('No stories in this area on these pages.'),
  ).toBeInTheDocument()
})
it('keeps Digest selected on a load failure instead of treating it as empty', () => {
  result = { ...base, isSuccess: false, isError: true, data: undefined }
  render(<Panel />)
  expect(screen.getByRole('tab', { name: 'Digest' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
})
