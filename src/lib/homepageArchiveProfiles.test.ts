import { loadHomepageArchiveProfiles } from './homepageArchiveProfiles'

const candidates = [
  {
    account_id: '42',
    username: 'old_username',
    avatar_media_url: 'https://example.com/old.jpg',
  },
  {
    account_id: '86927771',
    username: 'tessera_antra',
    avatar_media_url: 'https://example.com/tessera.jpg',
  },
  {
    account_id: '404',
    username: 'not_a_member',
    avatar_media_url: 'https://example.com/missing.jpg',
  },
]

function directoryClient(result: unknown) {
  const inFilter = jest.fn().mockResolvedValue(result)
  const select = jest.fn(() => ({ in: inFilter }))
  const from = jest.fn(() => ({ select }))
  const schema = jest.fn(() => ({ from }))

  return {
    client: { schema } as never,
    from,
    inFilter,
    schema,
    select,
  }
}

it('adds tweet counts, uses current profile data, and keeps only eligible directory users', async () => {
  const { client, inFilter } = directoryClient({
    data: [
      {
        account_id: '42',
        username: 'current_username',
        avatar_media_url: 'https://example.com/current.jpg',
        num_tweets: 12_345,
      },
    ],
    error: null,
  })

  await expect(
    loadHomepageArchiveProfiles(candidates, client),
  ).resolves.toEqual([
    {
      account_id: '42',
      username: 'current_username',
      avatar_media_url: 'https://example.com/current.jpg',
      num_tweets: 12_345,
    },
  ])
  expect(inFilter).toHaveBeenCalledWith('account_id', ['42', '404'])
})

it('degrades locally when the directory read is unavailable', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  const { client } = directoryClient({
    data: null,
    error: { message: 'unavailable' },
  })

  await expect(
    loadHomepageArchiveProfiles(candidates, client),
  ).resolves.toEqual([])
  expect(consoleError).toHaveBeenCalled()
  consoleError.mockRestore()
})
