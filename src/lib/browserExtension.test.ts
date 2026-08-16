import {
  CHROME_EXTENSION_PROBE_URL,
  type BrowserExtensionProbeImage,
  detectBrowserExtension,
} from '@/lib/browserExtension'

function createProbe(): BrowserExtensionProbeImage {
  return { onload: null, onerror: null, src: '' }
}

describe('browser extension detection', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  test('recognizes the published web-accessible resource', async () => {
    const image = createProbe()
    const status = detectBrowserExtension(image)

    expect(image.src).toBe(CHROME_EXTENSION_PROBE_URL)
    image.onload?.(new Event('load'))

    await expect(status).resolves.toBe('installed')
  })

  test('treats a failed resource load as not installed', async () => {
    const image = createProbe()
    const status = detectBrowserExtension(image)
    image.onerror?.(new Event('error'))

    await expect(status).resolves.toBe('not-installed')
  })

  test('treats a missing browser image API as not installed', async () => {
    await expect(detectBrowserExtension(undefined)).resolves.toBe(
      'not-installed',
    )
  })

  test('times out when the resource probe does not settle', async () => {
    jest.useFakeTimers()
    const image = createProbe()

    const status = detectBrowserExtension(image, 50)
    jest.advanceTimersByTime(50)

    await expect(status).resolves.toBe('not-installed')
  })
})
