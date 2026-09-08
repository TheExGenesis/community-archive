export function HowItWorks() {
  return (
    <details className="max-w-xl text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer font-semibold text-brand">
        How Birdseye works
      </summary>
      <p className="mt-2 leading-relaxed">
        Birdseye groups archived tweets by similarity, then uses AI to name
        topics and summarize their themes. Replies and quoted posts provide
        context. You’re browsing a saved analysis, so summaries may be mistaken
        and newer tweets may not be included.{' '}
        <a
          href="https://xiqo.substack.com/p/a-birdseye-view-of-your-tweets"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand underline underline-offset-2"
        >
          Read the original write-up ↗
        </a>
      </p>
    </details>
  )
}
