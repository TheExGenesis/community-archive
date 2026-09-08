import { fireEvent, render, screen } from '@testing-library/react'
import { MonthlyTimeline } from './MonthlyTimeline'
import { InsightItem } from './InsightItem'
import type { BirdseyeCluster } from '@/lib/community-apps/types'

const snowflake = (date: string) =>
  (
    (BigInt(Date.parse(date)) - BigInt('1288834974657')) <<
    BigInt(22)
  ).toString()
test('month counts appear on hover, keyboard focus and tap, including empty months', () => {
  render(
    <MonthlyTimeline
      cluster={
        {
          tweetIds: [snowflake('2022-01-01'), snowflake('2022-03-01')],
          sections: [],
        } as unknown as BirdseyeCluster
      }
    />,
  )
  const empty = screen.getByRole('button', { name: 'Feb 2022: 0 cited posts' })
  fireEvent.mouseEnter(empty)
  expect(screen.getByRole('tooltip')).toHaveTextContent('Feb 2022 · 0 posts')
  fireEvent.keyDown(empty, { key: 'Escape' })
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  fireEvent.focus(
    screen.getByRole('button', { name: 'Mar 2022: 1 cited posts' }),
  )
  expect(screen.getByRole('tooltip')).toHaveTextContent('Mar 2022 · 1 post')
  fireEvent.click(empty)
  expect(screen.getByRole('tooltip')).toHaveTextContent('Feb 2022 · 0 posts')
})
test('insight labels reveal descriptions and sources on hover and stay open when clicked', () => {
  render(
    <InsightItem
      item={{
        label: 'Community',
        description: 'Nurture connections',
        tweetIds: ['123'],
      }}
      username={null}
    />,
  )
  const trigger = screen.getByRole('button', { name: 'Community' })
  expect(screen.queryByText('Nurture connections')).not.toBeInTheDocument()
  fireEvent.mouseEnter(trigger)
  expect(screen.getByRole('dialog', { name: 'Community' })).toHaveTextContent(
    'Nurture connections',
  )
  fireEvent.click(trigger)
  expect(
    screen.getByRole('link', { name: 'Source 1 for Community' }),
  ).toHaveAttribute('href', '/tweets/123')
  fireEvent.click(trigger)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
