import { isMonitoringHealthRoute } from '@/lib/monitoringHealthRoute'

describe('monitoring health route classification', () => {
  it('allows only the exact readiness path', () => {
    expect(isMonitoringHealthRoute('/api/health')).toBe(true)
    expect(isMonitoringHealthRoute('/api/health/')).toBe(false)
    expect(isMonitoringHealthRoute('/api/healthcheck')).toBe(false)
    expect(isMonitoringHealthRoute('/api/search')).toBe(false)
  })
})
