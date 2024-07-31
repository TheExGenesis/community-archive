export const pipe =
  <T extends any[], R>(fn1: (...args: T) => R, ...fns: Array<(a: R) => R>) =>
  (...args: T): R =>
    fns.reduce((acc, fn) => fn(acc), fn1(...args))

export const compose =
  <T extends any[], R>(
    fnN: (...args: T) => R,
    ...fns: Array<(a: any) => any>
  ) =>
  (...args: T): R =>
    fns.reduceRight((acc, fn) => fn(acc), fnN(...args))

export const pipeAsync =
  <T extends any[], R>(
    fn1: (...args: T) => Promise<R> | R,
    ...fns: Array<(a: R) => Promise<R> | R>
  ) =>
  async (...args: T): Promise<R> => {
    let result = await fn1(...args)
    for (const fn of fns) {
      result = await fn(result)
    }
    return result
  }

// ... existing pipe and compose functions ...
