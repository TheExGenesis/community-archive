/** @jest-environment jsdom */
import { browserAuthDiagnostics } from './browserAuthDiagnostics'

afterEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  document.cookie = 'sb-test-auth-token=; Max-Age=0; Path=/'
  jest.restoreAllMocks()
})

test('diagnostics are disabled unless this browser tab opts in', () => {
  expect(browserAuthDiagnostics()).toBeUndefined()
})

test('diagnostics retain the opt-in across OAuth and discard SDK credentials', () => {
  window.history.replaceState({}, '', '/login?auth_debug=1')
  const logger = browserAuthDiagnostics()!.debug
  window.history.replaceState({}, '', '/')
  expect(browserAuthDiagnostics()).toBeDefined()
  document.cookie = 'sb-test-auth-token=secret-cookie-value; Path=/'
  const output = jest.spyOn(console, 'info').mockImplementation(() => {})

  logger('SDK prefix', '#_recoverAndRefresh()', 'secret-token', {
    access_token: 'secret-access-token',
  })
  logger('SDK prefix', 'https://example.invalid/?code=secret-code')
  const logged = JSON.stringify(output.mock.calls)
  expect(logged).toContain('#_recoverAndRefresh()')
  expect(logged).toContain('sb-test-auth-token')
  expect(logged).not.toContain('secret')
})
