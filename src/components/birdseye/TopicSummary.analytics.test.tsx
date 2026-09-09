import { fireEvent, render, screen } from '@testing-library/react'
import { TopicSummary } from './TopicSummary'
import { capturePostHogEvent, sanitizePostHogEvent } from '@/lib/posthog'
import type { CaptureResult } from 'posthog-js/dist/module.slim'

jest.mock('@/lib/posthog', () => ({
  ...jest.requireActual('@/lib/posthog'),
  capturePostHogEvent: jest.fn(),
}))
jest.mock('@/components/community-apps/AnalysisText', () => ({
  AnalysisText: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

it('captures an intentional summary expansion once and sends no private content', () => {
  render(<TopicSummary text="A private archive summary" />)
  fireEvent.click(screen.getByRole('button'))
  fireEvent.click(screen.getByRole('button'))
  expect(capturePostHogEvent).toHaveBeenCalledTimes(1)
  const [event, properties] = (capturePostHogEvent as jest.Mock).mock.calls[0]
  const sent = sanitizePostHogEvent({ event, properties } as CaptureResult)
  expect(sent?.properties).toMatchObject({
    feature: 'birdseye',
    action: 'summary_expanded',
    analytics_version: 2,
  })
  expect(JSON.stringify(sent)).not.toContain('private archive summary')
})
