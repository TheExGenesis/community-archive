'use client'

import { OwnKeyControl } from '@/components/agentSearch/OwnKeyControl'

/** Ask the archive's one setting: paying with one's own OpenRouter key. */
export function AskArchiveSettings({
  houseLimit,
  ownLimit,
}: {
  houseLimit: number
  ownLimit: number
}) {
  return (
    <section id="ask-archive" className="mb-8 rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Ask the archive</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {houseLimit.toLocaleString('en-US')} questions a day are on us.
      </p>
      <div className="mt-4 max-w-md">
        <OwnKeyControl ownLimit={ownLimit} />
      </div>
    </section>
  )
}
