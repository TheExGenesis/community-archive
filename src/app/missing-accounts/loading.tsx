export default function MissingAccountsLoading() {
  return (
    <main className="min-h-screen bg-background py-12 md:py-16">
      <div className="mx-auto w-full max-w-6xl animate-pulse px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto h-7 w-40 rounded-full bg-muted" />
          <div className="mx-auto mt-5 h-12 max-w-lg rounded bg-muted" />
          <div className="mx-auto mt-4 h-6 max-w-2xl rounded bg-muted" />
        </div>
        <div className="mx-auto mt-10 h-14 max-w-2xl rounded-lg bg-muted" />
        <div className="mt-8 h-8 w-48 rounded bg-muted" />
        <div className="mt-5 h-[34rem] rounded-lg border border-border bg-card" />
      </div>
    </main>
  )
}
