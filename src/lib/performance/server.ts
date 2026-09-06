import 'server-only'

/** Fixed stage names only: never log query text, account IDs or credentials. */
export async function measureServerRead<T>(
  stage: string,
  read: () => Promise<T>,
): Promise<T> {
  const start = performance.now()
  let outcome = 'ok'
  try {
    return await read()
  } catch (error) {
    outcome = 'error'
    throw error
  } finally {
    const durationMs = Math.round(performance.now() - start)
    if (
      process.env.NODE_ENV !== 'test' &&
      (durationMs >= 500 || process.env.CA_PERFORMANCE_LOGS === 'true')
    ) {
      console.info(
        JSON.stringify({
          message: 'Website read timing',
          stage,
          durationMs,
          outcome,
        }),
      )
    }
  }
}
