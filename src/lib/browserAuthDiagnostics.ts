// Temporary, opt-in diagnostics. Never forward the SDK's arguments: they can
// contain entire sessions, authorization URLs and bearer credentials.
export function browserAuthDiagnostics() {
  if (typeof window === 'undefined') return undefined
  try {
    if (new URLSearchParams(window.location.search).get('auth_debug') === '1') {
      window.sessionStorage.setItem('ca_auth_debug', '1')
    }
    if (window.sessionStorage.getItem('ca_auth_debug') !== '1') return undefined
  } catch {
    return undefined
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
