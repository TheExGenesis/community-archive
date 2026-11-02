'use client'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

/**
 * Where a question and its answer go, in plain terms, beside the composer.
 * Kept in step with docs/agent-search.md ("Data handling and retention").
 */
export function QuestionHandling() {
  return (
    <Popover>
      <PopoverTrigger className="rounded-sm underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        How questions are handled
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2.5 text-sm">
        <p className="font-semibold text-foreground">
          How questions are handled
        </p>
        <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
          <li>
            The model that runs the search sees your question and the tweets it
            finds. It is reached through OpenRouter, set to keep nothing and not
            train on it.
          </li>
          <li>
            Searches by meaning go to the Community Archive’s embeddings
            service. Relevance checks send tweet text, with a yes-or-no question
            written by the agent, to OpenAI.
          </li>
          <li>
            Conversations are saved to your account so you can come back to
            them, and only you can see them.
          </li>
          <li>
            Deleting a conversation removes its questions and answers. A record
            that a question was asked stays, for the daily and monthly limits.
            Working logs of each run expire within about 7 days; deleting
            doesn’t reach them.
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  )
}
