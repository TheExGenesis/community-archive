export const canShowHomepageSearch = (
  userId: string | null | undefined,
  isOptedIn: boolean | null | undefined,
) => Boolean(userId && isOptedIn === true)
