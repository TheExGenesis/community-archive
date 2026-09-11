export function RecommendationExplainer() {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5 text-sm leading-6 sm:p-6">
      <h2 className="text-xl font-semibold">
        How personal recommendations work
      </h2>
      <p>
        Recommended changes the order of accepted notices. It does not change
        which tweets the AI accepts, and it does not use an LLM to infer your
        interests.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Active notices come before past notices. Past notices are hidden
          unless you include them.
        </li>
        <li>
          Your own notices come first, then notices from your top 25 interaction
          partners, then everyone else.
        </li>
        <li>
          Among loaded cards in each group, asks with no recorded replies or
          quotes are lifted first. Higher interaction counts come next, followed
          by newer posts.
        </li>
      </ol>
      <p>
        Interaction partners come from your outgoing mentions, replies, quotes
        and reposts available in the archive, across all available years. Follow
        lists, likes, topic similarity and private messages are not used.
        Missing archive data can make these signals incomplete.
      </p>
      <p>
        If your identity or interaction data is unavailable, that part of
        personalization is skipped. The board can load before personal
        recommendations arrive. “Newest” sorts by posting time instead;
        reversing the sort reverses the order within the active and past groups.
      </p>
      <p className="text-muted-foreground">
        Reply and quote counts cover archived community members, so “unanswered”
        does not guarantee nobody has responded on X. This is a lightweight
        ranking of the accepted pool, not a prediction of what you will like.
      </p>
    </section>
  )
}
