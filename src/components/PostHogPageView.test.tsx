/** @jest-environment jsdom */

import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import PostHogPageView from './PostHogPageView'
import { capturePostHogEvent } from '@/lib/posthog'

let pathname = '/'

jest.mock('next/navigation', () => ({ usePathname: () => pathname }))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

describe('PostHogPageView', () => {
  beforeEach(() => jest.clearAllMocks())

  it('records stable feature names instead of URLs', () => {
    pathname = '/digest/2026-08-19/a-private-looking-slug'
    render(<PostHogPageView />)

    expect(capturePostHogEvent).toHaveBeenCalledWith('product_page_viewed', {
      page: 'digest_story',
    })
  })
})

beforeEach(() => jest.clearAllMocks())

it('records internal navigation once, including revisiting the original page', () => {
  pathname = '/social-graph'
  const view = render(
    <StrictMode>
      <PostHogPageView />
    </StrictMode>,
  )
  expect(capturePostHogEvent).toHaveBeenCalledTimes(1)
  pathname = '/strands/123'
  view.rerender(
    <StrictMode>
      <PostHogPageView />
    </StrictMode>,
  )
  pathname = '/social-graph'
  view.rerender(
    <StrictMode>
      <PostHogPageView />
    </StrictMode>,
  )
  expect(capturePostHogEvent).toHaveBeenCalledTimes(3)
})
