// Configuration of the Slack agent, all from the environment (the box env
// file plus what bin/fleet-run exports). Nothing is read from other files.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface Config {
  /** Slack */
  botToken: string
  appToken: string
  signalsChannel: string
  allowedUserIds: Set<string>
  /** Where things live */
  fleetHome: string
  fleetRoot: string
  runsDir: string
  dbPath: string
  worktreeBase: string
  taskScript: string
  runsScript: string
  instructionsPath: string
  /** GitHub */
  repo: string
  baseBranch: string
  githubToken?: string
  githubTokenScript?: string
  /** Claude Code */
  claudeBin: string
  claudeModel?: string
  maxTurns: number
  maxChangedLines: number
  exploreUrl?: string
  /** Service behaviour */
  intakeIntervalMs: number
  intakeEnabled: boolean
  maxConcurrentTasks: number
  progressIntervalMs: number
  /** Merge Tier 0 PRs under the line cap as soon as CI is green (no button). */
  autoMerge: boolean
  mergePollIntervalMs: number
  mergeWaitMs: number
  /** Everything else the child processes should see */
  env: NodeJS.ProcessEnv
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback
}

function nonEmpty(v: string | undefined): string | undefined {
  return v && v.trim() !== '' ? v.trim() : undefined
}

export function parseAllowedUserIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

/**
 * loadConfig reads the environment; `requireSlack: false` lets commands and
 * tests build a config without Slack tokens.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts: { requireSlack?: boolean } = {},
): Config {
  const requireSlack = opts.requireSlack ?? true
  const fleetHome =
    nonEmpty(env.FLEET_HOME) || path.join(os.homedir(), 'services', 'ca-fleet')
  const fleetRoot =
    nonEmpty(env.FLEET_ROOT) ||
    (fs.existsSync(path.join(fleetHome, 'repo', 'fleet', 'bin', 'task.sh'))
      ? path.join(fleetHome, 'repo')
      : findRepoRoot())
  const runsDir =
    nonEmpty(env.FLEET_RUNS_DIR) ||
    (fs.existsSync(fleetHome)
      ? path.join(fleetHome, 'runs')
      : path.join(fleetRoot, '.fleet-runs'))
  const dbPath =
    nonEmpty(env.FLEET_SLACK_DB) ||
    (fs.existsSync(fleetHome)
      ? path.join(fleetHome, 'slack.db')
      : path.join(runsDir, 'slack.db'))

  const allowedUserIds = parseAllowedUserIds(env.SLACK_ALLOWED_USER_IDS)
  const missing: string[] = []
  if (requireSlack) {
    if (!nonEmpty(env.SLACK_BOT_TOKEN)) missing.push('SLACK_BOT_TOKEN')
    if (!nonEmpty(env.SLACK_APP_TOKEN)) missing.push('SLACK_APP_TOKEN')
    if (!nonEmpty(env.SLACK_SIGNALS_CHANNEL))
      missing.push('SLACK_SIGNALS_CHANNEL')
    if (allowedUserIds.size === 0) missing.push('SLACK_ALLOWED_USER_IDS')
  }
  if (missing.length) {
    throw new Error(
      `fleet-slack: missing ${missing.join(', ')} in the environment`,
    )
  }

  return {
    botToken: nonEmpty(env.SLACK_BOT_TOKEN) || '',
    appToken: nonEmpty(env.SLACK_APP_TOKEN) || '',
    signalsChannel: nonEmpty(env.SLACK_SIGNALS_CHANNEL) || '',
    allowedUserIds,
    fleetHome,
    fleetRoot,
    runsDir,
    dbPath,
    worktreeBase:
      nonEmpty(env.FLEET_WORKTREE_BASE) ||
      path.join(env.TMPDIR || '/tmp', 'ca-fleet-worktrees'),
    taskScript: path.join(fleetRoot, 'fleet', 'bin', 'task.sh'),
    runsScript: path.join(fleetRoot, 'fleet', 'bin', 'runs.sh'),
    instructionsPath:
      nonEmpty(env.FLEET_SLACK_INSTRUCTIONS) ||
      path.join(fleetRoot, 'fleet', 'slack', 'INSTRUCTIONS.md'),
    repo: nonEmpty(env.FLEET_REPO) || 'TheExGenesis/community-archive',
    baseBranch: nonEmpty(env.FLEET_BASE_BRANCH) || 'main',
    githubToken: nonEmpty(env.FLEET_GITHUB_TOKEN) || nonEmpty(env.GH_TOKEN),
    githubTokenScript: nonEmpty(env.FLEET_GITHUB_APP_ID)
      ? nonEmpty(env.FLEET_GITHUB_TOKEN_SCRIPT) ||
        path.join(fleetHome, 'bin', 'fleet-github-token')
      : undefined,
    claudeBin: nonEmpty(env.FLEET_CLAUDE_BIN) || 'claude',
    claudeModel: nonEmpty(env.FLEET_CLAUDE_MODEL),
    maxTurns: num(env.FLEET_MAX_TURNS, 80),
    maxChangedLines: num(env.FLEET_MAX_CHANGED_LINES, 300),
    exploreUrl: nonEmpty(env.FLEET_RUNS_EXPLORE_URL),
    intakeIntervalMs: num(env.FLEET_SLACK_INTAKE_INTERVAL_S, 300) * 1000,
    intakeEnabled: (env.FLEET_SLACK_INTAKE || 'true') !== 'false',
    maxConcurrentTasks: num(env.FLEET_SLACK_MAX_CONCURRENT, 2),
    progressIntervalMs: num(env.FLEET_SLACK_PROGRESS_INTERVAL_S, 6) * 1000,
    autoMerge: (env.FLEET_SLACK_AUTOMERGE || 'true') !== 'false',
    mergePollIntervalMs: num(env.FLEET_SLACK_MERGE_POLL_S, 30) * 1000,
    mergeWaitMs: num(env.FLEET_SLACK_MERGE_WAIT_MIN, 40) * 60 * 1000,
    env,
  }
}

/** The repository root: the nearest ancestor of this file with fleet/bin/task.sh. */
export function findRepoRoot(
  from: string = new URL('.', import.meta.url).pathname,
): string {
  let dir = path.resolve(from)
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'fleet', 'bin', 'task.sh'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

/** `{run_id}` filled into FLEET_RUNS_EXPLORE_URL, or undefined. */
export function transcriptUrl(
  cfg: Pick<Config, 'exploreUrl'>,
  runId: string,
): string | undefined {
  if (!cfg.exploreUrl) return undefined
  return cfg.exploreUrl.split('{run_id}').join(runId)
}
