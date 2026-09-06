import { act, fireEvent, render } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import PagePerformance from './PagePerformance'
import { capturePostHogEvent } from '@/lib/posthog'

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))

jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

test('distinguishes document, observed clicks, and unknown navigation without leaking URLs', () => {
  const frames: FrameRequestCallback[] = []
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  const flush = () =>
    act(() => {
      while (frames.length) frames.shift()!(0)
    })
  ;(usePathname as jest.Mock).mockReturnValue('/')
  const { rerender } = render(
    <>
      <PagePerformance />
      <a href="/user/private-name" onClick={(event) => event.preventDefault()}>
        Profile
      </a>
    </>,
  )
  flush()
  expect(capturePostHogEvent).toHaveBeenLastCalledWith(
    'website_section_ready',
    expect.objectContaining({
      page: 'home',
      navigation_type: 'document',
      elapsed_ms: expect.any(Number),
    }),
  )
  fireEvent.click(document.querySelector('a')!)
  ;(usePathname as jest.Mock).mockReturnValue('/user/private-name')
  rerender(<PagePerformance />)
  flush()
  expect(capturePostHogEvent).toHaveBeenLastCalledWith(
    'website_section_ready',
    expect.objectContaining({
      page: 'profile',
      navigation_type: 'client',
      elapsed_ms: expect.any(Number),
    }),
  )
  ;(usePathname as jest.Mock).mockReturnValue('/search')
  rerender(<PagePerformance />)
  flush()
  expect(capturePostHogEvent).toHaveBeenLastCalledWith(
    'website_section_ready',
    { page: 'search', section: 'navigation_shell', navigation_type: 'unknown' },
  )
  expect(
    JSON.stringify((capturePostHogEvent as jest.Mock).mock.calls),
  ).not.toContain('private-name')
  jest.restoreAllMocks()
})
