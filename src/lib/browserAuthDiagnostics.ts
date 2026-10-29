// Temporary, opt-in diagnostics. Never forward the SDK's arguments: they can
// contain entire sessions, authorization URLs and bearer credentials.
export function browserAuthDiagnostics() {
  if (typeof window === 'undefined') return undefined
  try {
    if (new URLSearchParams(window.location.search).get('auth_debug') === '1') {
      window.sessionStorage.setItem('ca_auth_debug', '1')
    }
    if (window.sessionStorage.getItem('ca_auth_debug') !== '1') return undefined
    document.cookie = 'ca_auth_debug=1; Path=/; Max-Age=1800; SameSite=Lax'
  } catch {
    return undefined
  }

  // Observe writes from any browser code without changing their values/options.
  // This distinguishes JavaScript deletion from an HTTP Set-Cookie response.
  if (!Object.prototype.hasOwnProperty.call(document, 'cookie')) {
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
    if (cookie?.get && cookie.set) {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get() {
          return cookie.get!.call(this)
        },
        set(value: string) {
          const entry = String(value).split(';')[0]
          const separator = entry.indexOf('=')
          const name = entry.slice(0, separator)
          if (/^sb-.+-auth-token(?:\.\d+)?$/.test(name)) {
            console.info(
              '[auth-debug] browser cookie write',
              name,
              entry.length - separator - 1,
              new Error('Cookie write').stack,
            )
          }
          cookie.set!.call(this, value)
        },
      })
    }
  }

  return {
    debug: (...args: unknown[]) => {
      const operation = args[1]
      if (
        typeof operation !== 'string' ||
        !/^#[A-Za-z_]+\(\)$/.test(operation)
      ) {
        return
      }
      const cookies = document.cookie
        .split(';')
        .map((entry) => entry.trim())
        .filter((entry) => entry.startsWith('sb-'))
        .map((entry) => {
          const separator = entry.indexOf('=')
          return {
            name: entry.slice(0, separator),
            length: entry.length - separator - 1,
          }
        })
      console.info('[auth-debug]', operation, JSON.stringify(cookies))
      if (operation === '#_removeSession()') {
        console.info('[auth-debug] session removal stack', new Error().stack)
      }
    },
  }
}
