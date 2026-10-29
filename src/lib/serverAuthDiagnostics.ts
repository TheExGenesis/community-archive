type CookieSummaryInput = {
  name: string
  value: string
  options?: { maxAge?: number }
}

// Temporary, opt-in diagnostics. Never log cookie values or request query strings.
export function serverAuthDiagnostics(
  current: CookieSummaryInput[],
  writes: CookieSummaryInput[],
  context: string,
) {
  if (
    !current.some(
      ({ name, value }) => name === 'ca_auth_debug' && value === '1',
    )
  )
    return
  const summary = writes
    .filter(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name))
    .map(({ name, value, options }) => ({
      name,
      length: value.length,
      maxAge: options?.maxAge,
    }))
  if (summary.length)
    console.info(
      '[auth-debug] server cookie write',
      context,
      JSON.stringify(summary),
    )
}
