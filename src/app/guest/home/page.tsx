import ClassicHomepage from '@/components/home/ClassicHomepage'
import HomepagePeople from '@/components/home/HomepagePeople'
import { startHomepageData } from '@/lib/portal/data'

/**
 * The signed-out view of the homepage. The middleware rewrites cookie-less
 * document requests for `/` here so every visitor shares one cached render
 * instead of each holding a function for the length of the analytics reads.
 *
 * The window is short on purpose: a section whose read fails renders its own
 * failure state, and that render is what visitors see until the next
 * regeneration succeeds. The page names no account that an opt-out would
 * need to remove sooner; the featured people are a curated static list.
 */
export const dynamic = 'force-static'
export const revalidate = 60
export const maxDuration = 60

export default function GuestHomepage() {
  return (
    <ClassicHomepage
      data={startHomepageData()}
      isMember={false}
      showCta
      homepagePeople={<HomepagePeople />}
    />
  )
}
