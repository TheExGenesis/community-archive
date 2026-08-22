import { checkBotId } from 'botid/server'
import { enforceBotId } from '@/lib/botIdServer'

jest.mock('botid/server', () => ({ checkBotId: jest.fn() }))

const checkBotIdMock = jest.mocked(checkBotId)
const originalNodeEnv = process.env.NODE_ENV
const originalVercelEnv = process.env.VERCEL_ENV

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    configurable: true,
    value,
  })
}

describe('enforceBotId', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setNodeEnv('production')
    process.env.VERCEL_ENV = 'production'
  })

  afterAll(() => {
    setNodeEnv(originalNodeEnv)
    process.env.VERCEL_ENV = originalVercelEnv
  })

  it('blocks an unverified bot using the free basic check', async () => {
    checkBotIdMock.mockResolvedValue({
      isHuman: false,
      isBot: true,
      isVerifiedBot: false,
      bypassed: false,
    })

    const response = await enforceBotId()

    expect(checkBotIdMock).toHaveBeenCalledWith({
      advancedOptions: { checkLevel: 'basic' },
    })
    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({
      error: 'Automated requests are not allowed',
    })
  })

  it('allows verified bots', async () => {
    checkBotIdMock.mockResolvedValue({
      isHuman: false,
      isBot: true,
      isVerifiedBot: true,
      bypassed: false,
    })

    await expect(enforceBotId()).resolves.toBeNull()
  })

  it('fails open when BotID is unavailable', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    checkBotIdMock.mockRejectedValue(new Error('BotID unavailable'))

    await expect(enforceBotId()).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      'BotID verification failed open:',
      expect.any(Error),
    )

    errorSpy.mockRestore()
  })

  it('does not run BotID outside Vercel production', async () => {
    process.env.VERCEL_ENV = 'preview'

    await expect(enforceBotId()).resolves.toBeNull()
    expect(checkBotIdMock).not.toHaveBeenCalled()
  })
})
