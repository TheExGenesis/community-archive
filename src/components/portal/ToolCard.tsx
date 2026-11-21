import PostHogLink from '@/components/PostHogLink'
import { FaExternalLinkAlt } from 'react-icons/fa'
import type { PortalTool } from '@/components/portal/tools'
import { MUTED, SERIF } from '@/components/portal/styles'

export function ToolCard({ tool }: { tool: PortalTool }) {
  return (
    <PostHogLink
      eventName="community_app_action"
      eventProperties={{
        action: 'launch_clicked',
        app_slug: tool.slug,
        source: 'tools',
        external: !tool.link.startsWith('/'),
      }}
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
          className="h-44 w-full border-b border-zinc-200 object-cover dark:border-[#26262a]"
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
          <span className={`mt-1 block text-[13px] leading-normal ${MUTED}`}>
            {tool.description}
          </span>
        </span>
      </div>
    </PostHogLink>
  )
}
