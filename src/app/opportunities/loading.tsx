export default function LoadingOpportunities() {
  return (
    <main
      className="mx-auto w-full max-w-[1800px] space-y-4 px-4 py-4 sm:px-6"
      aria-busy="true"
    >
      <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
      <p role="status" className="text-sm text-muted-foreground">
        Loading opportunities…
      </p>
      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-[338px] animate-pulse rounded-lg border bg-muted/40"
          />
        ))}
      </div>
    </main>
  )
}
