/** Keep login return destinations on this site, including filters and fragments. */
export function safeAuthRedirect(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return '/'
  return value
}

export function loginHref(returnTo: string): string {
  return `/login?redirect=${encodeURIComponent(safeAuthRedirect(returnTo))}`
}
