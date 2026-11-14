import Link from 'next/link'
import NavIcon from '@/components/NavIcon'
import { getMoreTools } from '@/lib/navigation'

export const metadata = {
  title: 'More tools · Community Archive',
  description:
    'More ways to explore Community Archive: Bangers, Strands, the Conversation Map and the Social Graph.',
}

// Static: the list comes from the navigation definition.
export default function MoreToolsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">More tools</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Other ways to explore the archive, beyond the ones in the Tools menu.
        Projects built by the community are in the{' '}
        <Link href="/community" className="underline underline-offset-2">
          Community gallery
        </Link>
        .
      </p>
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {getMoreTools().map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="group/item flex h-full items-start gap-3.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/40 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <NavIcon name={tool.icon} />
              <span className="min-w-0 pt-0.5">
                <span className="block text-[15px] font-semibold leading-tight">
                  {tool.label}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                  {tool.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
