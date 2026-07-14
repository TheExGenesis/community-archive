import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CommunityStats from '@/components/CommunityStats'

describe('<CommunityStats />', () => {
  it('shows tweet and deduplicated participating-user totals', () => {
    const markup = renderToStaticMarkup(
      <CommunityStats userCount={500} tweetCount={13_600_000} />,
    )

    expect(markup).toContain('<strong>13.6M</strong> tweets')
    expect(markup).toContain('from <strong>500</strong> users')
    expect(markup).not.toMatch(/uploaded|opted in/i)
    expect(markup).not.toMatch(/liked tweets/i)
  })
})
