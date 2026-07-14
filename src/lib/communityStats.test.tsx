import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CommunityStats from '@/components/CommunityStats'

describe('<CommunityStats />', () => {
  it('shows tweet, uploaded-user, and opted-in-user totals without liked tweets', () => {
    const markup = renderToStaticMarkup(
      <CommunityStats
        accountCount={337}
        optInCount={48}
        tweetCount={13_600_000}
      />,
    )

    expect(markup).toContain('<strong>13.6M</strong> tweets')
    expect(markup).toContain('<strong>337</strong> uploaded')
    expect(markup).toContain('<strong>48</strong> opted in')
    expect(markup).not.toMatch(/users|archives/i)
    expect(markup).not.toMatch(/liked tweets/i)
  })
})
