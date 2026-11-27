import { RunDeadlineError, deadlinePassed } from './deadline'

// A counting gate: at most `size` tasks run at once and the rest wait their
// turn, first come first served. It rides on the run's limits (deadline.ts),
// which every gateway call already takes, as the trace does. Plain code only:
// the workflow body loads deadline.ts.

/** When a task should stop waiting for its turn. */
interface WaitLimits {
  deadlineAt?: number
  abortSignal?: AbortSignal
}

export interface Slots {
  /**
   * Runs `task` once a slot is free. A task still waiting when the run's
   * deadline passes or its signal aborts gives up its place and rejects.
   */
  run<T>(task: () => Promise<T>, limits?: WaitLimits): Promise<T>
}

export function createSlots(size: number): Slots {
  let free = Math.max(1, size)
  const waiting: Array<() => void> = []

  const turn = (limits: WaitLimits = {}) =>
    new Promise<void>((resolve, reject) => {
      if (deadlinePassed(limits)) {
        reject(limits.abortSignal?.reason ?? new RunDeadlineError())
        return
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const settle = () => {
        if (timer !== undefined) clearTimeout(timer)
        limits.abortSignal?.removeEventListener('abort', onAbort)
      }
      const take = () => {
        settle()
        resolve()
      }
      // Leaves the queue, so the slot goes to a task that can still use it.
      const leave = (reason: unknown) => {
        const at = waiting.indexOf(take)
        if (at !== -1) waiting.splice(at, 1)
        settle()
        reject(reason)
      }
      const onAbort = () =>
        leave(limits.abortSignal?.reason ?? new RunDeadlineError())
      if (limits.deadlineAt !== undefined) {
        timer = setTimeout(
          () => leave(new RunDeadlineError()),
          Math.max(0, limits.deadlineAt - Date.now()),
        )
      }
      limits.abortSignal?.addEventListener('abort', onAbort, { once: true })
      waiting.push(take)
    })

  return {
    async run(task, limits) {
      if (free > 0) free -= 1
      else await turn(limits)
      try {
        return await task()
      } finally {
        // A waiting task takes the slot directly; otherwise it is free again.
        const next = waiting.shift()
        if (next) next()
        else free += 1
      }
    },
  }
}

/** Runs `task` in one of the run's search slots, when its limits carry any. */
export function inSearchSlot<T>(
  limits: (WaitLimits & { searchSlots?: Slots }) | undefined,
  task: () => Promise<T>,
): Promise<T> {
  return limits?.searchSlots ? limits.searchSlots.run(task, limits) : task()
}
