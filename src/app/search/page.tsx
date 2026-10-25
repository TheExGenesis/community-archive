import { getBrowsingUser } from '@/lib/browsingAuth'
import SearchContent from './SearchContent'

export default async function SearchTweetsPage() {
  const user = await getBrowsingUser()
  return <SearchContent canSearch={Boolean(user)} />
}
