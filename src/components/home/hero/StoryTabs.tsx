'use client'

import { useId, useState, type ReactNode } from 'react'

const tabs = ['Digest', 'Strands'] as const

export default function StoryTabs({
  digest,
  strands,
}: {
  digest: ReactNode
  strands: ReactNode
}) {
  const [active, setActive] = useState(0)
  const id = useId()
  return (
    <div className="p-5 xl:max-h-[calc(min(66vh,660px)_+_6.5rem)] xl:overflow-y-auto xl:p-6">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Community stories
      </p>
      <div
        role="tablist"
        aria-label="Community stories"
        className="mb-5 flex gap-1 rounded-lg bg-muted p-1"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 1
                    : event.key === 'ArrowRight' || event.key === 'ArrowLeft'
                      ? 1 - index
                      : null
              if (next !== null) {
                event.preventDefault()
                setActive(next)
                document.getElementById(`${id}-tab-${next}`)?.focus()
              }
            }}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${active === index ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab}
          </button>
        ))}
      </div>
      {[digest, strands].map((content, index) => (
        <div
          key={tabs[index]}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
          tabIndex={0}
        >
          {content}
        </div>
      ))}
    </div>
  )
}
