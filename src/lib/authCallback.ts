export type AuthErrorDetails = {
  error?: string | null
  errorCode?: string | null
  errorDescription?: string | null
}

const MAX_AUTH_ERROR_LENGTH = 300

const cleanAuthErrorValue = (value?: string | null) => {
  const cleaned = value?.trim()
  return cleaned ? cleaned.slice(0, MAX_AUTH_ERROR_LENGTH) : null
}

export function buildAuthErrorUrl(
  origin: string,
  { error, errorCode, errorDescription }: AuthErrorDetails,
) {
  const url = new URL('/auth/auth-code-error', origin)
  const values = {
    error: cleanAuthErrorValue(error),
    error_code: cleanAuthErrorValue(errorCode),
    error_description: cleanAuthErrorValue(errorDescription),
  }

  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value)
  }

  return url
}

export function getAuthErrorCopy({
  error,
  errorDescription,
}: AuthErrorDetails) {
  const normalizedDescription = errorDescription?.toLowerCase() ?? ''

  if (
    normalizedDescription.includes('getting user email from external provider')
  ) {
    return {
      title: 'X did not provide an email address',
      description:
        'Community Archive now supports X accounts without an email address. Please try signing in again.',
    }
  }

  if (error === 'access_denied') {
    return {
      title: 'Sign-in was canceled',
      description:
        'No changes were made. You can try again whenever you are ready.',
    }
  }

  return {
    title: 'We could not sign you in',
    description:
      'The sign-in provider returned an error. Please try again, or contact us if it keeps happening.',
  }
}
