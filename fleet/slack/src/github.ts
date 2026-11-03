// GitHub credentials for a long-running process. bin/fleet-run mints one
// installation token per run, which suits a timer but not a service that
// lives for days: here a static FLEET_GITHUB_TOKEN is used as is, and GitHub
// App credentials are re-minted through bin/fleet-github-token when the
// current token is older than 50 minutes (installation tokens last an hour).
import { execOk } from './shell.js'

export interface TokenProvider {
  /** Environment additions for gh/git/task.sh calls (GH_TOKEN, FLEET_GITHUB_TOKEN). */
  env(): Promise<NodeJS.ProcessEnv>
  /** Human-readable description for `status`. */
  describe(): string
}

const TOKEN_TTL_MS = 50 * 60 * 1000

export function createTokenProvider(opts: {
  staticToken?: string
  mintScript?: string
  baseEnv: NodeJS.ProcessEnv
  now?: () => number
}): TokenProvider {
  const now = opts.now ?? (() => Date.now())
  let token = opts.staticToken
  let mintedAt = token ? Number.POSITIVE_INFINITY : 0
  const hasMint = Boolean(opts.mintScript)
  return {
    async env() {
      if (!token && !hasMint) return {}
      if (!opts.staticToken && hasMint && now() - mintedAt > TOKEN_TTL_MS) {
        token = (
          await execOk(opts.mintScript as string, [], { env: opts.baseEnv })
        ).trim()
        mintedAt = now()
      }
      return token ? { GH_TOKEN: token, FLEET_GITHUB_TOKEN: token } : {}
    },
    describe() {
      if (opts.staticToken) return 'static FLEET_GITHUB_TOKEN'
      if (hasMint) return 'GitHub App installation token (re-minted hourly)'
      return 'none: set FLEET_GITHUB_TOKEN or the FLEET_GITHUB_APP_* keys'
    },
  }
}
