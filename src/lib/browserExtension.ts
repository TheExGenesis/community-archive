export const CHROME_EXTENSION_ID = 'igclpobjpjlphgllncjcgaookmncegbk'

export const CHROME_EXTENSION_URL = `https://chromewebstore.google.com/detail/community-archive-stream/${CHROME_EXTENSION_ID}`

export const EXTENSION_STATUS_REQUEST =
  'community-archive:extension-status' as const

export type BrowserExtensionStatus = 'checking' | 'installed' | 'not-installed'

export interface BrowserExtensionRuntime {
  lastError?: { message?: string }
  sendMessage: (
    extensionId: string,
    message: { type: typeof EXTENSION_STATUS_REQUEST },
    callback: (response?: unknown) => void,
  ) => void
}

let sharedStatusRequest:
  | Promise<Exclude<BrowserExtensionStatus, 'checking'>>
  | undefined

function browserRuntime(): BrowserExtensionRuntime | undefined {
  return (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: BrowserExtensionRuntime }
    }
  ).chrome?.runtime
}

export function detectBrowserExtension(
  runtime = browserRuntime(),
  timeoutMs = 800,
): Promise<Exclude<BrowserExtensionStatus, 'checking'>> {
  if (!runtime?.sendMessage) return Promise.resolve('not-installed')

  return new Promise((resolve) => {
    let settled = false
    const finish = (status: 'installed' | 'not-installed') => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(status)
    }
    const timeout = setTimeout(() => finish('not-installed'), timeoutMs)

    try {
      runtime.sendMessage(
        CHROME_EXTENSION_ID,
        { type: EXTENSION_STATUS_REQUEST },
        (response) => {
          // Reading lastError prevents Chrome from logging an expected error
          // when the extension is absent or predates the status handshake.
          void runtime.lastError
          const installed =
            typeof response === 'object' &&
            response !== null &&
            'installed' in response &&
            response.installed === true
          finish(installed ? 'installed' : 'not-installed')
        },
      )
    } catch {
      finish('not-installed')
    }
  })
}

export function getBrowserExtensionStatus() {
  sharedStatusRequest ??= detectBrowserExtension()
  return sharedStatusRequest
}
