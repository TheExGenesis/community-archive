interface PortalPageLoadingProps {
  label: string
}

export function PortalPageLoading({ label }: PortalPageLoadingProps) {
  return (
    <main
      aria-busy="true"
      aria-label={label}
      className="min-h-screen bg-zinc-100/80 dark:bg-transparent"
    >
      <div className="mx-auto max-w-[1600px] animate-pulse px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-3 h-4 w-24 rounded bg-zinc-300/80 dark:bg-zinc-800" />
        <div className="mb-3 h-8 w-44 rounded bg-zinc-300/80 dark:bg-zinc-800" />
        <div className="mb-7 h-4 max-w-2xl rounded bg-zinc-300/70 dark:bg-zinc-800/80" />
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="space-y-2">
                  <div className="h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
