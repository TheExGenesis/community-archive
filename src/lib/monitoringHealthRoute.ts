/** Exact machine-readable readiness route used by the production probe. */
export function isMonitoringHealthRoute(pathname: string): boolean {
  return pathname === '/api/health'
}
