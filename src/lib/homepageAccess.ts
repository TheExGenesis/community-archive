export const canShowHomepageSearch = (
  userId: string | null | undefined,
  isOptedIn: boolean | null | undefined,
) => Boolean(userId && isOptedIn === true)

export const hasPendingOptInAction = (action: string | string[] | undefined) =>
  Array.isArray(action) ? action.includes('optin') : action === 'optin'
