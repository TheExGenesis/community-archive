import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StoryCard from './StoryCard'
import type { MapStory } from '@/lib/hexMap/stories'
import { captureHomepageMapAction } from '@/lib/posthog'

jest.mock('./hero.module.css', () => ({}))
jest.mock('@/lib/posthog', () => ({ captureHomepageMapAction: jest.fn() }))

it('counts the story open without counting prefetch, focus or hover as an open', () => {
  const client = new QueryClient()
  jest.spyOn(client, 'prefetchQuery').mockResolvedValue()
  const observer = window.IntersectionObserver
  window.IntersectionObserver = jest
    .fn()
    .mockImplementation(() => ({ observe: jest.fn(), disconnect: jest.fn() }))
  const onOpen = jest.fn()
  const story = {
    id: 'private-id',
    title: 'A story',
    subtitle: 'Story text',
    kind: 'digest',
    date: '2026-10-26',
    category: 'News',
    people: [],
  } as unknown as MapStory
  const view = render(
    <QueryClientProvider client={client}>
      <StoryCard story={story} onOpen={onOpen} onHover={jest.fn()} />
    </QueryClientProvider>,
  )
  const button = screen.getByRole('button', { name: /A story/ })
  fireEvent.mouseEnter(button)
  fireEvent.focus(button)
  expect(captureHomepageMapAction).not.toHaveBeenCalled()
  fireEvent.click(button)
  expect(captureHomepageMapAction).toHaveBeenCalledTimes(1)
  expect(captureHomepageMapAction).toHaveBeenCalledWith('story_opened')
  expect(onOpen).toHaveBeenCalledWith(story)
  view.unmount()
  client.clear()
  window.IntersectionObserver = observer
})
