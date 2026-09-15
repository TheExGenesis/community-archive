import { getActiveDigestSubscriberCount } from '@/lib/digest/emailSubscriptions'

export async function DigestSubscriberCount() {
  try {
    const count = await getActiveDigestSubscriberCount()
    return (
      <span className="text-xs text-muted-foreground">
        {count.toLocaleString('en-US')} email{' '}
        {count === 1 ? 'subscriber' : 'subscribers'}
      </span>
    )
  } catch {
    // A failed count must not break the edition or look like zero subscribers.
    return null
  }
}
