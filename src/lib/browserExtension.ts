export const CHROME_EXTENSION_ID = 'igclpobjpjlphgllncjcgaookmncegbk'

export const CHROME_EXTENSION_URL = `https://chromewebstore.google.com/detail/community-archive-stream/${CHROME_EXTENSION_ID}`

export const CHROME_EXTENSION_PROBE_URL = `chrome-extension://${CHROME_EXTENSION_ID}/assets/custom/nopfp2_4832.jpg`

export type BrowserExtensionStatus = 'checking' | 'installed' | 'not-installed'

export interface BrowserExtensionProbeImage {
  onload: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  src: string
}

let sharedStatusRequest:
  | Promise<Exclude<BrowserExtensionStatus, 'checking'>>
  | undefined

function createProbeImage(): BrowserExtensionProbeImage | undefined {
  if (typeof Image === 'undefined') return undefined
  return new Image()
}

export function detectBrowserExtension(
  image = createProbeImage(),
  timeoutMs = 800,
): Promise<Exclude<BrowserExtensionStatus, 'checking'>> {
  if (!image) return Promise.resolve('not-installed')

  return new Promise((resolve) => {
    let settled = false
    const finish = (status: 'installed' | 'not-installed') => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve(status)
    }
    const timeout = setTimeout(() => finish('not-installed'), timeoutMs)

    image.onload = () => finish('installed')
    image.onerror = () => finish('not-installed')

    try {
      // Version 0.0.3 already exposes this image as a web-accessible resource.
      // A successful load is a positive signal without messaging the extension.
      image.src = CHROME_EXTENSION_PROBE_URL
    } catch {
      finish('not-installed')
    }
  })
}

export function getBrowserExtensionStatus() {
  sharedStatusRequest ??= detectBrowserExtension()
  return sharedStatusRequest
}
