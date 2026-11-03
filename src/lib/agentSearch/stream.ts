import type { UIMessageChunk } from 'ai'
import { RunExpiredError } from 'workflow/errors'

// WorkflowChatTransport keeps reconnecting until it sees a `finish` chunk. A
// cancelled run's stream is not closed (seen with the local world: the start
// route's stream stayed open until its 300 s limit after a cancel), a run that
// ends without its own finish closes without one, and a run past Workflow's
// retention throws RunExpiredError when read. Any of these would keep the page
// waiting or polling, so these streams end with a finish chunk once the source
// has closed, and fail (so the page reconnects) when they cannot tell that the
// page has everything the run wrote.

const FINISH: UIMessageChunk = { type: 'finish' }
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])
const POLL_MS = 5_000
const DRAIN_MS = 1_000

/** A stream that holds only a finish chunk: there is nothing left to read. */
export function finishedStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(FINISH)
      controller.close()
    },
  })
}

/** Whether a Workflow run status means the run will write nothing more. */
export const isTerminalStatus = (status: string | null | undefined) =>
  Boolean(status && TERMINAL.has(status))

/**
 * Passes the run's chunks through and ends with a finish chunk when the
 * source closes without one, or has expired. While a read waits, `runEnded`
 * is checked every `pollMs`: once the run is over, chunks already written may
 * still be arriving, so reading goes on until the source closes or has been
 * quiet for a moment. A source still open then is not trusted to have given
 * everything, so the stream fails instead of finishing: the page reconnects
 * from where it was, and a cancelled or expired run answers that reconnect
 * with a plain finish (the stream route). Any other read error also fails the
 * response, so the page reconnects and tries again.
 */
export function endWithFinish(
  source: ReadableStream<UIMessageChunk>,
  runEnded?: () => Promise<boolean>,
  pollMs: number = POLL_MS,
): ReadableStream<UIMessageChunk> {
  const reader = source.getReader()
  let finished = false
  let stopped = false
  const never = new Promise<never>(() => {})
  // One poller for the whole stream, started on the first read.
  let ended: Promise<'ended'> | null = null
  const watch = () =>
    (ended ??= (async () => {
      if (!runEnded) return never
      while (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, pollMs))
        if (stopped) break
        if (await runEnded().catch(() => false)) return 'ended' as const
      }
      return never
    })())
  const end = (controller: ReadableStreamDefaultController<UIMessageChunk>) => {
    stopped = true
    if (!finished) controller.enqueue(FINISH)
    finished = true
    controller.close()
  }
  // A read that lost a race stays pending and is reused, so no chunk is lost.
  let pendingRead: Promise<ReadableStreamReadResult<UIMessageChunk>> | null =
    null
  let draining = false
  const quiet = () =>
    new Promise<'ended'>((resolve) =>
      setTimeout(() => resolve('ended'), DRAIN_MS),
    )
  return new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          pendingRead ??= reader.read()
          const next = await Promise.race([
            pendingRead,
            draining ? quiet() : watch(),
          ])
          if (next === 'ended') {
            if (!draining) {
              draining = true
              continue
            }
            void reader.cancel().catch(() => undefined)
            // Its own finish already went through: nothing is missing.
            if (finished) return end(controller)
            stopped = true
            controller.error(
              new Error('The run is over; its stream stayed open'),
            )
            return
          }
          pendingRead = null
          if (next.done) return end(controller)
          if (next.value.type === 'finish') finished = true
          controller.enqueue(next.value)
          return
        }
      } catch (error) {
        if (RunExpiredError.is(error)) return end(controller)
        stopped = true
        controller.error(error)
      }
    },
    cancel(reason) {
      stopped = true
      return reader.cancel(reason)
    },
  })
}

/**
 * Lets a run's stream close only once the run is over. The run's readable
 * can close while the run goes on (with the local world it closed after
 * 45 to 110 s while the workflow kept calling the model), and the UI chunk
 * transform answers any close with a finish chunk, which tells the page the
 * answer is done. Failing the stream instead makes the page reconnect and
 * read on from where it was. A close seen while the run is still going fails
 * even if the run ends a moment later: the page cannot have the chunks
 * written after the close, and the reconnect replays them.
 */
export function closeWhenRunEnds<T>(
  source: ReadableStream<T>,
  runEnded: () => Promise<boolean>,
): ReadableStream<T> {
  return source.pipeThrough(
    new TransformStream<T, T>({
      async flush(controller) {
        if (await runEnded().catch(() => false)) return
        controller.error(
          new Error('The run is still going; its stream closed early'),
        )
      },
    }),
  )
}
