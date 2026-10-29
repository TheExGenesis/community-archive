import { serverAuthDiagnostics } from './serverAuthDiagnostics'

test('server diagnostics require opt-in and only log session cookie names and sizes', () => {
  const output = jest.spyOn(console, 'info').mockImplementation(() => {})
  const writes = [
    {
      name: 'sb-test-auth-token.0',
      value: 'secret-session',
      options: { maxAge: 3600 },
    },
    { name: 'sb-test-auth-token.1', value: '', options: { maxAge: 0 } },
    { name: 'unrelated', value: 'secret-unrelated' },
  ]
  try {
    serverAuthDiagnostics([], writes, '/api/auth/navigation')
    expect(output).not.toHaveBeenCalled()
    serverAuthDiagnostics(
      [{ name: 'ca_auth_debug', value: '1' }],
      writes,
      '/api/auth/navigation',
    )
    const logged = JSON.stringify(output.mock.calls)
    expect(logged).toContain('sb-test-auth-token.0')
    expect(JSON.parse(output.mock.calls[0][2])).toContainEqual({
      name: 'sb-test-auth-token.1',
      length: 0,
      maxAge: 0,
    })
    expect(logged).not.toContain('secret')
    expect(logged).not.toContain('unrelated')
  } finally {
    output.mockRestore()
  }
})
