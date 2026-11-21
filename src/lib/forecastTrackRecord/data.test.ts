import {
  assembleReportData,
  extractReportData,
  renderReport,
  splitReportData,
  type ReportData,
} from './data'

const report: ReportData = {
  as_of: '2026-11-14',
  funnel: { 'Forecasts extracted': 3 },
  method: { claims: 3 },
  authors: [
    { author: 'zed', n: 5, points: 1.2 },
    { author: 'Amy', n: 6, points: 0.4 },
  ],
  claims: [
    { id: 'c1', a: 'Amy', claim: 'X by 2025 </script><!-- ok' },
    { id: 'c2', a: 'zed', claim: 'Y' },
    { id: 'c3', a: 'bo', claim: 'Z' },
  ],
  profiles: { amy: { name: 'Amy A' }, zed: { name: 'Zed' } },
}

describe('forecast track record data', () => {
  it('keeps only aggregates in the run summary', () => {
    const run = splitReportData(report)
    expect(run.asOf).toBe('2026-11-14')
    expect(Object.keys(run.summary).sort()).toEqual([
      'as_of',
      'funnel',
      'method',
    ])
    expect(run.authors.map((a) => [a.username, a.claims.length])).toEqual([
      ['Amy', 1],
      ['zed', 1],
      ['bo', 1],
    ])
    expect(run.authors[2].score).toBeNull()
    expect(run.authors[0].profile).toEqual({ name: 'Amy A' })
  })

  it('reassembles stored authors in leaderboard order without dropped ones', () => {
    const run = splitReportData(report)
    // The database returns authors by name and drops non-members ("bo").
    const stored = [run.authors[0], run.authors[1]].map((a) => ({ ...a }))
    const data = assembleReportData({
      as_of: run.asOf,
      summary: run.summary,
      authors: stored,
    })
    expect(data.authors.map((a) => a.author)).toEqual(['zed', 'Amy'])
    expect(data.claims.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(Object.keys(data.profiles ?? {}).sort()).toEqual(['amy', 'zed'])
    expect(data.funnel).toEqual(report.funnel)
  })

  it('round-trips through the rendered page without breaking out of the script', () => {
    const html = renderReport(report)
    expect(html.match(/<\/script>/g)?.length).toBe(
      (html.match(/<script/g) ?? []).length,
    )
    expect(extractReportData(html).claims[0].claim).toBe(
      'X by 2025 </script><!-- ok',
    )
  })

  it('reads the prototype escaping of report.html', () => {
    const html =
      '<script id="data" type="application/json">{"authors":[],"claims":[{"t":"a <\\/b> <\\!-- c"}]}</script>'
    expect(extractReportData(html).claims[0].t).toBe('a </b> <!-- c')
  })
})
