import {
  CHROME_EXTENSION_ID,
  EXTENSION_STATUS_REQUEST,
  type BrowserExtensionRuntime,
  detectBrowserExtension,
} from '@/lib/browserExtension'

describe('browser extension detection', () => {
  test('recognizes the extension status response', async () => {
    const runtime: BrowserExtensionRuntime = {
      sendMessage: (extensionId, message, callback) => {
        expect(extensionId).toBe(CHROME_EXTENSION_ID)
        expect(message).toEqual({ type: EXTENSION_STATUS_REQUEST })
        callback({ installed: true, version: '0.0.4' })
      },
    }

    await expect(detectBrowserExtension(runtime)).resolves.toBe('installed')
  })

  test('treats a missing browser messaging API as not installed', async () => {
    await expect(detectBrowserExtension(undefined)).resolves.toBe(
      'not-installed',
    )
  })

  test('times out when an older extension cannot answer', async () => {
    jest.useFakeTimers()
    const runtime: BrowserExtensionRuntime = {
      sendMessage: () => undefined,
    }

    const status = detectBrowserExtension(runtime, 50)
    jest.advanceTimersByTime(50)

    await expect(status).resolves.toBe('not-installed')
    jest.useRealTimers()
  })
})
