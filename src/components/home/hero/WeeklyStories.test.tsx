import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import WeeklyStories, { weeklyHighlight } from './WeeklyStories'
import type { MapStory, WeeklyMapPage } from '@/lib/hexMap/stories'
import { captureHomepageMapAction } from '@/lib/posthog'
jest.mock('@/lib/posthog', () => ({ captureHomepageMapAction: jest.fn() }))
jest.mock('./hero.module.css', () => ({}))
jest.mock('./StoryCard', () => ({
  __esModule: true,
  default: ({
    story,
    onOpen,
  }: {
    story: MapStory
    onOpen: (story: MapStory) => void
  }) => <button onClick={() => onOpen(story)}>{story.title}</button>,
}))

const daily = (id: string, cells: number[], people: string[]): MapStory => ({
  id,
  kind: 'digest',
  title: `Daily ${id}`,
  subtitle: '',
  date: id.slice(0, 10),
  category: 'Tech',
  href: `/digest/${id}`,
  people: people.map((username, i) => ({
    username,
    avatar: null,
    cell: cells[i],
  })),
  cells,
  origin: cells[0],
})
const page: WeeklyMapPage = {
  weekStart: '2026-11-09',
  weekEnd: '2026-11-15',
  soFar: true,
  throughDate: '2026-11-13',
  located: true,
  stories: [
    {
      id: '2026-11-09/big',
      title: 'The big story',
      subtitle: 'All week',
      href: '/digest/week#big',
      days: ['2026-11-10', '2026-11-11'],
      stories: [
        daily('2026-11-10/one', [3, 4], ['alice', 'bob']),
        daily('2026-11-11/two', [4, 9], ['Bob', 'carol']),
      ],
    },
    {
      id: '2026-11-09/small',
      title: 'A small story',
      subtitle: 'One day',
      href: '/digest/week#small',
      days: ['2026-11-12'],
      stories: [daily('2026-11-12/three', [1], ['dan'])],
    },
  ],
}

function Section({
  onOpen = () => {},
  onHover = () => {},
}: {
  onOpen?: (s: MapStory) => void
  onHover?: (s: MapStory | null) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <WeeklyStories
      week={page}
      heading="This week"
      href="/digest/week"
      expanded={expanded}
      onExpand={setExpanded}
      onOpen={onOpen}
      onHover={onHover}
    />
  )
}

beforeEach(() => jest.clearAllMocks())

it('leads with the week so far and opens one weekly story into its daily stories', () => {
  const onOpen = jest.fn()
  render(<Section onOpen={onOpen} />)
  expect(screen.getByRole('heading', { name: 'This week' })).toBeInTheDocument()
  expect(
    screen.getByText(/The Week So Far, 9 Nov – 13 Nov/),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Read it all ↗' })).toHaveAttribute(
    'href',
    '/digest/week',
  )
  expect(screen.queryByText('Daily 2026-11-10/one')).not.toBeInTheDocument()
  const big = screen.getByRole('button', { name: /The big story/ })
  expect(big).toHaveAttribute('aria-expanded', 'false')
  expect(big).toHaveTextContent('2 days · 2 daily stories')
  fireEvent.click(big)
  expect(big).toHaveAttribute('aria-expanded', 'true')
  expect(captureHomepageMapAction).toHaveBeenCalledWith('weekly_story_expanded')
  fireEvent.click(screen.getByRole('button', { name: 'Daily 2026-11-11/two' }))
  expect(onOpen).toHaveBeenCalledWith(
    expect.objectContaining({ id: '2026-11-11/two' }),
  )
  expect(
    screen.getByRole('link', { name: 'Read the weekly story ↗' }),
  ).toHaveAttribute('href', '/digest/week#big')

  // Opening another weekly story closes the first; collapsing is not counted.
  fireEvent.click(screen.getByRole('button', { name: /A small story/ }))
  expect(big).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByText('Daily 2026-11-12/three')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /A small story/ }))
  expect(captureHomepageMapAction).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('Daily 2026-11-12/three')).not.toBeInTheDocument()
})

it('highlights the union of a weekly story’s daily cells and people on hover', () => {
  const onHover = jest.fn()
  render(<Section onHover={onHover} />)
  fireEvent.mouseEnter(screen.getByRole('button', { name: /The big story/ }))
  const highlight = onHover.mock.calls[0][0] as MapStory
  expect(highlight.cells).toEqual([3, 4, 9])
  expect(highlight.people.map((p) => p.username)).toEqual([
    'alice',
    'bob',
    'carol',
  ])
  expect(highlight.origin).toBe(3)
  fireEvent.mouseLeave(screen.getByRole('button', { name: /The big story/ }))
  expect(onHover).toHaveBeenLastCalledWith(null)
  expect(weeklyHighlight(page.stories[1]).cells).toEqual([1])
})
