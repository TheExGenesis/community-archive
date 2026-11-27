import { PORTAL_TOOLS } from '@/components/portal/tools'
import { MUTED, SERIF } from '@/components/portal/styles'
import { ToolCard } from '@/components/portal/ToolCard'
import { AdminTools } from '@/components/portal/AdminTools'

export const metadata = {
  title: 'Tools · Community Archive',
  description:
    'Tools built on Community Archive: explore conversations, chart ideas, and search the corpus by meaning.',
}

// Public: tools built on the archive are useful to visitors and members alike.
// Admin tools render client-side only for admins, so the page stays static.
export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
        <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
          Tools
        </h1>
        <div className={`mb-[18px] text-[13px] ${MUTED}`}>
          Apps and projects built on the archive&apos;s open data — browse
          conversations, chart ideas, and search the corpus by meaning.
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {PORTAL_TOOLS.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
        <AdminTools />
      </div>
    </main>
  )
}
