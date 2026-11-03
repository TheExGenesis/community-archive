// SQLite state of the Slack agent (node:sqlite, no native module): which
// Slack thread is which Claude session, worktree, run and PR; which inbox
// issues were already posted. One file on the box: $FLEET_HOME/slack.db.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type ThreadKind = 'task' | 'intake'
export type ThreadState =
  | 'new'
  | 'queued'
  | 'working'
  | 'gate'
  | 'waiting'
  | 'pr_open'
  | 'held'
  | 'merged'
  | 'closed'
  | 'error'

export interface ThreadRecord {
  channel: string
  threadTs: string
  kind: ThreadKind
  state: ThreadState
  title: string
  requestedBy: string
  sessionId?: string
  runDir?: string
  worktree?: string
  branch?: string
  prNumber?: number
  prUrl?: string
  issueNumber?: number
  statusTs?: string
  createdAt: string
  updatedAt: string
}

/** A shipped change: one branch, run dir and PR of a thread; the thread moves on, the job keeps its PR state. */
export type JobState = 'pr_open' | 'held' | 'merged' | 'closed'

export interface JobRecord {
  channel: string
  threadTs: string
  prNumber: number
  prUrl: string
  runDir: string
  branch: string
  worktree: string
  issueNumber?: number
  statusTs?: string
  requestedBy: string
  state: JobState
  createdAt: string
  updatedAt: string
}

export interface PostedIssue {
  issueNumber: number
  channel: string
  threadTs: string
  classification?: string
  postedAt: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS threads (
  channel TEXT NOT NULL,
  thread_ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  session_id TEXT,
  run_dir TEXT,
  worktree TEXT,
  branch TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  issue_number INTEGER,
  status_ts TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (channel, thread_ts)
);
CREATE INDEX IF NOT EXISTS threads_pr ON threads (pr_number);
CREATE INDEX IF NOT EXISTS threads_state ON threads (state);
CREATE TABLE IF NOT EXISTS jobs (
  pr_number INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,
  thread_ts TEXT NOT NULL,
  pr_url TEXT NOT NULL,
  run_dir TEXT NOT NULL,
  branch TEXT NOT NULL,
  worktree TEXT NOT NULL,
  issue_number INTEGER,
  status_ts TEXT,
  requested_by TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_thread ON jobs (channel, thread_ts);
CREATE TABLE IF NOT EXISTS posted_issues (
  issue_number INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,
  thread_ts TEXT NOT NULL,
  classification TEXT,
  posted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

function rowToThread(r: Record<string, unknown>): ThreadRecord {
  const opt = (v: unknown) =>
    v === null || v === undefined ? undefined : (v as never)
  return {
    channel: String(r.channel),
    threadTs: String(r.thread_ts),
    kind: String(r.kind) as ThreadKind,
    state: String(r.state) as ThreadState,
    title: String(r.title ?? ''),
    requestedBy: String(r.requested_by ?? ''),
    sessionId: opt(r.session_id),
    runDir: opt(r.run_dir),
    worktree: opt(r.worktree),
    branch: opt(r.branch),
    prNumber:
      r.pr_number === null || r.pr_number === undefined
        ? undefined
        : Number(r.pr_number),
    prUrl: opt(r.pr_url),
    issueNumber:
      r.issue_number === null || r.issue_number === undefined
        ? undefined
        : Number(r.issue_number),
    statusTs: opt(r.status_ts),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

function rowToJob(r: Record<string, unknown>): JobRecord {
  return {
    channel: String(r.channel),
    threadTs: String(r.thread_ts),
    prNumber: Number(r.pr_number),
    prUrl: String(r.pr_url),
    runDir: String(r.run_dir),
    branch: String(r.branch),
    worktree: String(r.worktree),
    issueNumber:
      r.issue_number === null || r.issue_number === undefined
        ? undefined
        : Number(r.issue_number),
    statusTs:
      r.status_ts === null || r.status_ts === undefined
        ? undefined
        : String(r.status_ts),
    requestedBy: String(r.requested_by ?? ''),
    state: String(r.state) as JobState,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export class Store {
  private db: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:')
      fs.mkdirSync(path.dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db.close()
  }

  // ─── threads ─────────────────────────────────────────────────────────────

  getThread(channel: string, threadTs: string): ThreadRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM threads WHERE channel = ? AND thread_ts = ?')
      .get(channel, threadTs)
    return row ? rowToThread(row) : undefined
  }

  getThreadByPr(prNumber: number): ThreadRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM threads WHERE pr_number = ? ORDER BY updated_at DESC LIMIT 1',
      )
      .get(prNumber)
    return row ? rowToThread(row) : undefined
  }

  listThreads(states?: ThreadState[]): ThreadRecord[] {
    if (!states || states.length === 0) {
      return this.db
        .prepare('SELECT * FROM threads ORDER BY updated_at DESC')
        .all()
        .map(rowToThread)
    }
    const marks = states.map(() => '?').join(',')
    return this.db
      .prepare(
        `SELECT * FROM threads WHERE state IN (${marks}) ORDER BY updated_at DESC`,
      )
      .all(...states)
      .map(rowToThread)
  }

  createThread(input: {
    channel: string
    threadTs: string
    kind: ThreadKind
    title: string
    requestedBy: string
    state?: ThreadState
    issueNumber?: number
  }): ThreadRecord {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO threads (channel, thread_ts, kind, state, title, requested_by, issue_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(channel, thread_ts) DO UPDATE SET
           kind = excluded.kind, state = excluded.state, title = excluded.title,
           requested_by = excluded.requested_by, issue_number = COALESCE(excluded.issue_number, threads.issue_number),
           updated_at = excluded.updated_at`,
      )
      .run(
        input.channel,
        input.threadTs,
        input.kind,
        input.state || 'new',
        input.title,
        input.requestedBy,
        input.issueNumber ?? null,
        now,
        now,
      )
    return this.getThread(input.channel, input.threadTs) as ThreadRecord
  }

  updateThread(
    channel: string,
    threadTs: string,
    patch: Partial<
      Omit<ThreadRecord, 'channel' | 'threadTs' | 'createdAt' | 'updatedAt'>
    >,
  ): ThreadRecord | undefined {
    const columns: Record<string, string> = {
      kind: 'kind',
      state: 'state',
      title: 'title',
      requestedBy: 'requested_by',
      sessionId: 'session_id',
      runDir: 'run_dir',
      worktree: 'worktree',
      branch: 'branch',
      prNumber: 'pr_number',
      prUrl: 'pr_url',
      issueNumber: 'issue_number',
      statusTs: 'status_ts',
    }
    const sets: string[] = []
    const values: (string | number | null)[] = []
    for (const [key, col] of Object.entries(columns)) {
      if (!(key in patch)) continue
      const v = (patch as Record<string, unknown>)[key]
      sets.push(`${col} = ?`)
      values.push(v === undefined || v === null ? null : (v as string | number))
    }
    sets.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(channel, threadTs)
    this.db
      .prepare(
        `UPDATE threads SET ${sets.join(', ')} WHERE channel = ? AND thread_ts = ?`,
      )
      .run(...values)
    return this.getThread(channel, threadTs)
  }

  // ─── jobs ────────────────────────────────────────────────────────────────

  upsertJob(job: Omit<JobRecord, 'createdAt' | 'updatedAt'>): JobRecord {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO jobs (pr_number, channel, thread_ts, pr_url, run_dir, branch, worktree, issue_number, status_ts, requested_by, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pr_number) DO UPDATE SET
           pr_url = excluded.pr_url, run_dir = excluded.run_dir, branch = excluded.branch,
           worktree = excluded.worktree, issue_number = excluded.issue_number, status_ts = excluded.status_ts,
           requested_by = excluded.requested_by, state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(
        job.prNumber,
        job.channel,
        job.threadTs,
        job.prUrl,
        job.runDir,
        job.branch,
        job.worktree,
        job.issueNumber ?? null,
        job.statusTs ?? null,
        job.requestedBy,
        job.state,
        now,
        now,
      )
    return this.getJob(job.prNumber) as JobRecord
  }

  getJob(prNumber: number): JobRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE pr_number = ?')
      .get(prNumber)
    return row ? rowToJob(row) : undefined
  }

  setJobState(prNumber: number, state: JobState): JobRecord | undefined {
    this.db
      .prepare('UPDATE jobs SET state = ?, updated_at = ? WHERE pr_number = ?')
      .run(state, new Date().toISOString(), prNumber)
    return this.getJob(prNumber)
  }

  /** Jobs of a thread, newest first. */
  listJobs(channel: string, threadTs: string): JobRecord[] {
    return this.db
      .prepare(
        'SELECT * FROM jobs WHERE channel = ? AND thread_ts = ? ORDER BY pr_number DESC',
      )
      .all(channel, threadTs)
      .map(rowToJob)
  }

  /** Jobs still waiting on CI or a human (state pr_open), for the merge waits to resume after a restart. */
  listOpenJobs(): JobRecord[] {
    return this.db
      .prepare("SELECT * FROM jobs WHERE state = 'pr_open' ORDER BY pr_number")
      .all()
      .map(rowToJob)
  }

  // ─── posted issues (intake dedupe) ───────────────────────────────────────

  hasPostedIssue(issueNumber: number): boolean {
    return (
      this.db
        .prepare('SELECT 1 AS one FROM posted_issues WHERE issue_number = ?')
        .get(issueNumber) !== undefined
    )
  }

  getPostedIssue(issueNumber: number): PostedIssue | undefined {
    const r = this.db
      .prepare('SELECT * FROM posted_issues WHERE issue_number = ?')
      .get(issueNumber)
    if (!r) return undefined
    return {
      issueNumber: Number(r.issue_number),
      channel: String(r.channel),
      threadTs: String(r.thread_ts),
      classification:
        r.classification === null ? undefined : String(r.classification),
      postedAt: String(r.posted_at),
    }
  }

  getPostedIssueByThread(
    channel: string,
    threadTs: string,
  ): PostedIssue | undefined {
    const r = this.db
      .prepare(
        'SELECT * FROM posted_issues WHERE channel = ? AND thread_ts = ?',
      )
      .get(channel, threadTs)
    return r ? this.getPostedIssue(Number(r.issue_number)) : undefined
  }

  recordPostedIssue(
    issueNumber: number,
    channel: string,
    threadTs: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO posted_issues (issue_number, channel, thread_ts, posted_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(issue_number) DO NOTHING`,
      )
      .run(issueNumber, channel, threadTs, new Date().toISOString())
  }

  setIssueClassification(issueNumber: number, classification: string): void {
    this.db
      .prepare(
        'UPDATE posted_issues SET classification = ? WHERE issue_number = ?',
      )
      .run(classification, issueNumber)
  }

  countPostedIssues(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM posted_issues').get()
    return Number(r?.n ?? 0)
  }

  // ─── meta ────────────────────────────────────────────────────────────────

  getMeta(key: string): string | undefined {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
    return r && r.value !== null ? String(r.value) : undefined
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value)
  }
}
