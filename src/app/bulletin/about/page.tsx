import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How the Bulletin works | Community Archive',
  robots: { index: false, follow: false },
}

export default function BulletinAboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <Link
        href="/bulletin"
        className="text-sm text-brand hover:underline"
      >
        ← Back to the board
      </Link>
      <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight">
        How the Bulletin works
      </h1>
      <div className="mt-6 space-y-6 text-[15px] leading-7 text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">The scan</h2>
          <p className="mt-2">
            After each daily archive refresh, a worker reads members&apos;
            original tweets from the previous two days. Replies and reposts are
            skipped. Tweets that match phrases like &quot;happy to help&quot;,
            &quot;looking for&quot;, &quot;anyone know&quot; or &quot;DM
            me&quot; go to a labeler, which decides whether the tweet is a
            genuine ask or offer and writes the one-line summary, the kind, how
            the author wants to be reached, a place, and any date the tweet
            names. Starting a tweet with &quot;offer:&quot; or &quot;ask:&quot;
            is the surest way to be picked up.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">
            Who appears
          </h2>
          <p className="mt-2">
            Members who uploaded an archive or opted in. Accounts that opted out
            never appear, and a notice disappears if the tweet is edited or
            deleted. The board keeps the latest 2,000 notices.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">
            How long a notice stays
          </h2>
          <p className="mt-2">
            If the tweet names a date, that date is the deadline and the card
            shows it. Otherwise an ask stays for 14 days and an offer for 60.
            Standing offers stay up until the tweet goes. Quoting your own
            notice restarts the clock. Past notices are hidden unless you turn
            on &quot;Show past&quot;.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Ordering</h2>
          <p className="mt-2">
            Relevance puts your own notices first, then people you reply to and
            quote most, then everyone else. Within each group, asks with no
            member reply come before answered ones, then newest. Date is newest
            first. The arrow icon reverses either order.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">
            Counts and labels
          </h2>
          <p className="mt-2">
            The reply count is public replies and quote posts from archived
            members. It cannot see replies from anyone outside the archive, so
            no count means unknown, not zero. &quot;following&quot;,
            &quot;follows you&quot; and &quot;mutual&quot; come from the follow
            lists in members&apos; own archive uploads, which are snapshots, not
            live Twitter state.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">
            What gets missed
          </h2>
          <p className="mt-2">
            Tweets without ask-or-offer phrasing, anything the archive has not
            ingested yet, and the labeler&apos;s own mistakes. This is a
            selection, not a directory. Read the tweet before acting on it.
          </p>
        </section>
      </div>
    </main>
  )
}
