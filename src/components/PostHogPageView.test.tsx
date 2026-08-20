/** @jest-environment jsdom */

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
