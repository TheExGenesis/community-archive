import type { UIMessageChunk } from 'ai'
import { RunExpiredError } from 'workflow/errors'

// WorkflowChatTransport keeps reconnecting until it sees a `finish` chunk. A
// cancelled run's stream is not closed (seen with the local world: the start
// route's stream stayed open until its 300 s limit after a cancel), a run that
// ends without its own finish closes without one, and a run past Workflow's
// retention throws RunExpiredError when read. Any of these would keep the page
// waiting or polling, so these streams always end with a finish chunk.

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
 * source closes without one, has expired, or stays silent while `runEnded`
 * reports the run over (checked every `pollMs` while a read waits). Any other
 * read error still fails the response, so the page reconnects and tries again.
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
  // Once the run is over, chunks already written may still be arriving:
  // keep reading until the source is quiet for DRAIN_MS.
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
            return end(controller)
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

/** How long a closed stream waits for its run's status to catch up. */
const SETTLE_MS = 2_000

/**
 * Lets a run's stream close only once the run is over. The run's readable
 * can close while the run goes on (with the local world it closed after
 * 45 to 110 s while the workflow kept calling the model), and the UI chunk
 * transform answers any close with a finish chunk, which tells the page the
 * answer is done. Failing the stream instead makes the page reconnect and
 * read on from where it was. A run whose status lags its last chunk gets a
 * short grace before the stream fails.
 */
export function closeWhenRunEnds<T>(
  source: ReadableStream<T>,
  runEnded: () => Promise<boolean>,
  settleMs: number = SETTLE_MS,
): ReadableStream<T> {
  const ended = () => runEnded().catch(() => false)
  return source.pipeThrough(
    new TransformStream<T, T>({
      async flush(controller) {
        if (await ended()) return
        await new Promise((resolve) => setTimeout(resolve, settleMs))
        if (await ended()) return
        controller.error(
          new Error('The run is still going; its stream closed early'),
        )
      },
    }),
  )
}
