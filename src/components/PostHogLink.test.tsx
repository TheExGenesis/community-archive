import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PostHogLink from './PostHogLink'
import { capturePostHogEvent } from '@/lib/posthog'

jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

it('preserves the anchor ref and captures click, keyboard and middle-click launches once each', async () => {
  const user = userEvent.setup()
  const ref = createRef<HTMLAnchorElement>()
  const properties = {
    action: 'launch_clicked',
    app_slug: 'birdseye',
    source: 'homepage',
    external: false,
  }
  render(
    <PostHogLink
      ref={ref}
      href="#app"
      eventName="community_app_action"
      eventProperties={properties}
    >
      Open app
    </PostHogLink>,
  )
  const link = screen.getByRole('link', { name: 'Open app' })
  expect(ref.current).toBe(link)
  await user.click(link)
  await user.keyboard('{Enter}')
  fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
  fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 2 }))
  expect(capturePostHogEvent).toHaveBeenCalledTimes(3)
  expect(capturePostHogEvent).toHaveBeenLastCalledWith(
    'community_app_action',
    properties,
  )
})
