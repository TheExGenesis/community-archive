'use client'

import { useNavigationAudience } from '@/components/NavigationAudience'
import { ADMIN_TOOLS } from '@/components/portal/tools'
import { MUTED, SERIF } from '@/components/portal/styles'
import { ToolCard } from '@/components/portal/ToolCard'

/** Admin research tools. /tools stays a static public page; the section
 *  appears after the navigation audience check says the viewer is an admin. */
export function AdminTools() {
  const { isAdmin } = useNavigationAudience()
  if (!isAdmin) return null
  return (
    <section className="mt-8" aria-labelledby="admin-tools-heading">
      <h2
        id="admin-tools-heading"
        className="mb-1 text-[19px] font-semibold"
        style={SERIF}
      >
        Admin tools
      </h2>
      <div className={`mb-3.5 text-[13px] ${MUTED}`}>
        Research prototypes visible only to admins. They rank or grade named
        members, so they are not public.
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {ADMIN_TOOLS.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
      </div>
    </section>
  )
}
