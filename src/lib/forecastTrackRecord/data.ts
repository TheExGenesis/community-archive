/**
 * Moves forecast track record data between the prototype's report.html, the
 * database (one row per author, so an opt-out can delete exactly one member)
 * and the admin page.
 */
import { REPORT_TEMPLATE } from './reportTemplate'

type Json = unknown
type Row = Record<string, Json>

/** What render_html.py's build_data() embeds in report.html. */
export interface ReportData {
  as_of?: string | null
  authors: Row[]
  claims: Row[]
  profiles?: Record<string, Row>
  [key: string]: Json
}

export interface StoredAuthor {
  username: string
  score: Row | null
  profile: Row | null
  claims: Row[]
}

export interface StoredRun {
  as_of: string | null
  uploaded_at?: string
  summary: Row
  authors: StoredAuthor[]
}

/** Keys that hold per-person data; everything else in the report is aggregate. */
const PERSONAL_KEYS = new Set(['authors', 'claims', 'profiles'])

const DATA_SCRIPT =
  /<script id="data" type="application\/json">([\s\S]*?)<\/script>/

export function extractReportData(html: string): ReportData {
  const match = DATA_SCRIPT.exec(html)
  if (!match)
    throw new Error(
      'No embedded data found: is this a track record report.html?',
    )
  // render_html.py escapes "</" as "<\/" (valid JSON) and "<!--" as "<\!--" (not).
  const data = JSON.parse(match[1].replaceAll('<\\!--', '<!--')) as ReportData
  if (!Array.isArray(data.claims) || !Array.isArray(data.authors))
    throw new Error('The embedded data has no claims or authors list.')
  return data
}

const authorOf = (claim: Row) => String(claim.a ?? '').trim()

export function splitReportData(data: ReportData): {
  asOf: string | null
  summary: Row
  authors: StoredAuthor[]
} {
  const summary: Row = {}
  for (const [key, value] of Object.entries(data)) {
    if (!PERSONAL_KEYS.has(key)) summary[key] = value
  }
  const byAuthor = new Map<string, StoredAuthor>()
  const entry = (username: string) => {
    const key = username.toLowerCase()
    let author = byAuthor.get(key)
    if (!author) {
      author = {
        username,
        score: null,
        profile: data.profiles?.[key] ?? null,
        claims: [],
      }
      byAuthor.set(key, author)
    }
    return author
  }
  for (const claim of data.claims) {
    const username = authorOf(claim)
    if (username) entry(username).claims.push(claim)
  }
  // The leaderboard's order (ranked first, then by points) is kept in _order,
  // because the database returns authors by name.
  data.authors.forEach((score, index) => {
    const username = String(score.author ?? '').trim()
    if (username) entry(username).score = { ...score, _order: index }
  })
  return {
    asOf: typeof data.as_of === 'string' ? data.as_of : null,
    summary,
    authors: Array.from(byAuthor.values()),
  }
}

/**
 * Rebuild the report's data from what the database kept. Authors the upload
 * left out (not members, or opted out) are simply absent; the leaderboard
 * keeps its stored order.
 */
export function assembleReportData(run: StoredRun): ReportData {
  const profiles: Record<string, Row> = {}
  const claims: Row[] = []
  const scores: Row[] = []
  for (const author of run.authors) {
    if (author.profile) profiles[author.username.toLowerCase()] = author.profile
    claims.push(...author.claims)
    if (author.score) scores.push(author.score)
  }
  const order = (score: Row) => {
    const value = Number(score._order)
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
  }
  scores.sort((a, b) => order(a) - order(b))
  return { ...run.summary, as_of: run.as_of, profiles, authors: scores, claims }
}

export function renderReport(data: ReportData): string {
  // "<" as < keeps the payload from closing the script element or
  // opening a comment, and stays valid JSON.
  const blob = JSON.stringify(data).replace(/</g, '\\u003c')
  return REPORT_TEMPLATE.replace('__DATA__', () => blob)
}
