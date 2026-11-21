import 'server-only'

import { digestEmailSiteUrl } from '@/lib/digest/emailLinks'

export const searchAlertUnsubscribeUrl = (token: string) =>
  `${digestEmailSiteUrl()}/api/search-alerts/email/unsubscribe?token=${encodeURIComponent(token)}`

export const searchAlertSettingsUrl = () =>
  `${digestEmailSiteUrl()}/settings#search-alerts`
