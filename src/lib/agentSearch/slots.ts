// A counting gate: at most `size` tasks run at once and the rest wait their
// turn, first come first served. It rides on the run's limits (deadline.ts),
// which every gateway call already takes, as the trace does. Plain code only:
// the workflow body loads deadline.ts.

export interface Slots {
  run<T>(task: () => Promise<T>): Promise<T>
}

export function createSlots(size: number): Slots {
  let free = Math.max(1, size)
  const waiting: Array<() => void> = []
  return {
    async run(task) {
      if (free > 0) free -= 1
      else await new Promise<void>((resolve) => waiting.push(resolve))
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
  limits: { searchSlots?: Slots } | undefined,
  task: () => Promise<T>,
): Promise<T> {
  return limits?.searchSlots ? limits.searchSlots.run(task) : task()
}
