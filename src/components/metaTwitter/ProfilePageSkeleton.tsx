const Pulse = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-md bg-muted ${className}`} />
)

export function ProfileArchiveSkeleton() {
  return (
    <div
      aria-label="Loading profile archive"
      className="grid grid-cols-1 border-t border-border md:grid-cols-[250px_1fr]"
    >
      <aside className="hidden border-r border-border p-5 md:block">
        <Pulse className="mb-4 h-3 w-20" />
        <Pulse className="h-11 w-full rounded-full" />
      </aside>
      <main className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_280px]">
        <section className="space-y-3">
          <Pulse className="h-7 w-52" />
          <Pulse className="h-4 w-72 max-w-full" />
          <Pulse className="h-48 w-full rounded-lg" />
          <Pulse className="h-48 w-full rounded-lg" />
        </section>
        <aside className="space-y-5">
          <Pulse className="h-32 w-full" />
          <Pulse className="h-40 w-full" />
        </aside>
      </main>
    </div>
  )
}

export function ProfilePageSkeleton() {
  return (
    <div className="flex justify-center px-4 py-8 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-lg border border-border bg-card">
        <Pulse className="h-[210px] w-full rounded-none" />
        <div className="space-y-3 px-6 pb-5">
          <Pulse className="-mt-[58px] h-[116px] w-[116px] rounded-full" />
          <Pulse className="h-6 w-52" />
          <Pulse className="h-4 w-28" />
          <Pulse className="h-4 w-80 max-w-full" />
        </div>
        <ProfileArchiveSkeleton />
      </div>
    </div>
  )
}
