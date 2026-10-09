import type { UIMessageChunk } from 'ai'
import { RunExpiredError } from 'workflow/errors'

// WorkflowChatTransport keeps reconnecting until it sees a `finish` chunk. A
// run that was cancelled, or ended without its own finish, closes its stream
// without one, and a run past Workflow's retention throws RunExpiredError
// when read. Either way the page would poll forever, so these streams always
// end with a finish chunk.

const FINISH: UIMessageChunk = { type: 'finish' }

/** A stream that holds only a finish chunk: there is nothing left to read. */
export function finishedStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(FINISH)
      controller.close()
    },
  })
}

/**
 * Passes the run's chunks through and adds a finish chunk when the source
 * ends without one or has expired. Any other read error still fails the
 * response, so the page reconnects and tries again.
 */
export function endWithFinish(
  source: ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  const reader = source.getReader()
  let finished = false
  const end = (controller: ReadableStreamDefaultController<UIMessageChunk>) => {
    if (!finished) controller.enqueue(FINISH)
    finished = true
    controller.close()
  }
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) return end(controller)
        if (value.type === 'finish') finished = true
        controller.enqueue(value)
      } catch (error) {
        if (RunExpiredError.is(error)) return end(controller)
        controller.error(error)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}
