export default function LoadingShelfPage() {
  return (
    <div className="flex justify-center px-4 pb-8 pt-4 sm:px-6">
      <div
        aria-busy="true"
        aria-label="Loading shelf"
        className="w-full max-w-[1220px] overflow-hidden rounded-lg border border-border bg-card"
      >
        <div className="border-b border-border px-4 pb-5 pt-6 sm:px-6">
          <div className="h-8 w-48 animate-pulse rounded-full bg-muted" />
          <div className="mt-4 h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        {[0, 1].map((row) => (
          <div key={row} className="px-4 py-5 sm:px-6">
            <div className="h-5 w-24 animate-pulse rounded-md bg-muted" />
            <div className="mt-3 flex gap-5 overflow-hidden">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className="h-[174px] w-[116px] shrink-0 animate-pulse rounded-sm bg-muted"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
