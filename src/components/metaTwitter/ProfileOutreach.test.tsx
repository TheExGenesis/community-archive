import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileOutreach, outreachIntentHref } from './ProfileOutreach'
import type { ArchivePerson } from '@/lib/metaTwitter/types'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt = '', ...props }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

const candidate: ArchivePerson = {
  user_id: '8',
  screen_name: 'carol',
  name: 'Carol',
  interactions: 12,
  avatar_media_url: null,
  in_archive: false,
}

afterEach(() => jest.restoreAllMocks())

test('shows personalized non-member suggestions with an editable X intent', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ people: [candidate] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  render(<ProfileOutreach accountId="42" />)

  expect(await screen.findByText('Carol')).toBeVisible()
  expect(screen.getByText('@carol · 12 interactions')).toBeVisible()
  const link = screen.getByRole('link', { name: 'Invite' })
  expect(link).toHaveAttribute('href', outreachIntentHref(candidate))
  expect(
    new URL(link.getAttribute('href')!).searchParams.get('text'),
  ).toContain('@carol')
})

test('offers a retry after a temporary request failure', async () => {
  const user = userEvent.setup()
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ people: [] }), { status: 200 }),
    )

  render(<ProfileOutreach accountId="42" />)
  await user.click(
    await screen.findByRole('button', {
      name: 'Suggestions are unavailable. Retry',
    }),
  )

  expect(
    await screen.findByText('No non-member suggestions right now.'),
  ).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
