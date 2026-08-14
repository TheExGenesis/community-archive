import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Workspace } from './Workspace'
import type { BangerTweet } from '@/lib/metaTwitter/types'

const tweets: BangerTweet[] = Array.from({ length: 13 }, (_, index) => ({
  tweet_id: String(100 + index),
  account_id: '42',
  created_at: `2025-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  full_text: `Banger ${index}`,
  favorite_count: 100 - index,
  retweet_count: 10 - Math.min(index, 10),
  reply_to_username: null,
  username: 'alice',
  account_display_name: 'Alice',
  avatar_media_url: null,
  media: [],
  quote_count: 20 - index,
  quoting_accounts: 20 - index,
}))

test('shows the complete banger set progressively with archive quote counts', async () => {
  const user = userEvent.setup()
  render(
    <Workspace
      username="alice"
      displayName="Alice"
      avatarUrl={null}
      contextTitle="Overall — Bangers"
      contextDesc="Quoted at least twice."
      tweets={tweets}
      bangersAvailable
      media={[]}
      mediaCount={0}
      people={[]}
      peopleTitle="Top people"
    />,
  )

  expect(screen.getByText('❝ 20 archive quotes')).toBeInTheDocument()
  expect(screen.queryByText('Banger 12')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Show more bangers' }))

  expect(screen.getByText('Banger 12')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Show more bangers' }),
  ).not.toBeInTheDocument()
})
