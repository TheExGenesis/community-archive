import { FaExternalLinkAlt } from 'react-icons/fa'
import { PORTAL_TOOLS } from '@/components/portal/tools'
import { MUTED, SERIF } from '@/components/portal/styles'

export const metadata = { title: 'Tools · Community Archive' }

// Public: tools built on the archive are useful to visitors and members alike.
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
            <a
              key={tool.name}
              href={tool.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-[4px] border border-zinc-200 bg-white transition-colors hover:border-brand/60 dark:border-[#26262a] dark:bg-[#1b1b1e]"
            >
              {tool.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tool.image}
                  alt={`${tool.name} preview`}
                  loading="lazy"
                  className="h-36 w-full border-b border-zinc-200 object-cover dark:border-[#26262a]"
                />
              )}
              <div className="flex items-start gap-3.5 p-[18px]">
                <span className="mt-1 flex-shrink-0 text-[22px] text-brand">
                  {tool.icon}
                </span>
                <span className="min-w-0">
                  <span
                    className="flex items-center gap-2 text-[17px] font-semibold"
                    style={SERIF}
                  >
                    {tool.name}
                    <FaExternalLinkAlt className="h-3 w-3 flex-shrink-0 text-zinc-900 opacity-0 transition-opacity group-hover:opacity-70 dark:text-white" />
                  </span>
                  <span
                    className={`mt-1 block text-[13px] leading-normal ${MUTED}`}
                  >
                    {tool.description}
                  </span>
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
