import {
  looksLikeOpenRouterKey,
  ownKeyErrorForStatus,
  ownKeySecret,
  redactKeys,
  sealOwnKey,
  unsealOwnKey,
} from './ownKey'

const KEY = `sk-or-v1-${'a1'.repeat(32)}`
const SECRET = 'a server secret that is long enough to use'

describe('own OpenRouter keys', () => {
  test('a sealed key opens for its run, and holds no trace of the key', async () => {
    const sealed = await sealOwnKey(KEY, 'asr_1', SECRET)
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+$/)
    expect(sealed).not.toContain(KEY)
    expect(sealed).not.toContain('sk-or')
    await expect(unsealOwnKey(sealed, 'asr_1', SECRET)).resolves.toBe(KEY)
    // A fresh IV each time: the same key never seals to the same text.
    expect(await sealOwnKey(KEY, 'asr_1', SECRET)).not.toBe(sealed)
  })

  test('it does not open for another run, another secret or altered text', async () => {
    const sealed = await sealOwnKey(KEY, 'asr_1', SECRET)
    await expect(unsealOwnKey(sealed, 'asr_2', SECRET)).rejects.toThrow()
    await expect(
      unsealOwnKey(sealed, 'asr_1', `${SECRET} but different`),
    ).rejects.toThrow()
    const [version, iv, body] = sealed.split('.')
    const altered = `${version}.${iv}.${body.slice(0, -2)}AA`
    await expect(unsealOwnKey(altered, 'asr_1', SECRET)).rejects.toThrow()
    await expect(unsealOwnKey('nonsense', 'asr_1', SECRET)).rejects.toThrow(
      'Unreadable sealed key',
    )
  })

  test('only a long enough secret seals', () => {
    expect(ownKeySecret({ AGENT_SEARCH_KEY_SECRET: 'short' })).toBeNull()
    expect(ownKeySecret({})).toBeNull()
    expect(ownKeySecret({ AGENT_SEARCH_KEY_SECRET: SECRET })).toBe(SECRET)
  })

  test('recognises OpenRouter keys and redacts them from text', () => {
    expect(looksLikeOpenRouterKey(KEY)).toBe(true)
    expect(looksLikeOpenRouterKey('sk-proj-123')).toBe(false)
    expect(looksLikeOpenRouterKey(`${KEY} extra`)).toBe(false)
    expect(redactKeys(`Bearer ${KEY} refused`)).toBe('Bearer sk-or-… refused')
  })

  test('maps OpenRouter refusals to what the member can do about them', () => {
    expect(ownKeyErrorForStatus(401)).toBe('own_key_invalid')
    expect(ownKeyErrorForStatus(402)).toBe('own_key_no_credit')
    expect(ownKeyErrorForStatus(403)).toBe('own_key_refused')
    expect(ownKeyErrorForStatus(429)).toBe('own_key_rate_limited')
    expect(ownKeyErrorForStatus(500)).toBeNull()
  })
})
