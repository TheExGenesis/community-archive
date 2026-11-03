/** Daily budgets reset at UTC midnight. */
export function startOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString()
}

/** Monthly question limits reset at the start of the UTC month. */
export function startOfUtcMonth(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString()
}

/** The start of the next UTC month, when the monthly count starts over. */
export function startOfNextUtcMonth(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString()
}
