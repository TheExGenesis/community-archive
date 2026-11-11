// Two switches, both read from the environment so they change without a
// deploy.
//
// AGENT_SEARCH_LAUNCHED is the launch flag. Unset means not launched: Ask the
// archive is hidden from everyone but admins (no nav item, no search-box
// entry points, the page and POST /api/agent-search answer 404), so it can
// ship to production and be tried there before members see it. Set it to
// true (or 1, on, yes) to launch.
//
// AGENT_SEARCH_ENABLED pauses Ask the archive once it is visible. Unset means
// on: the feature already needs migrations and keys before it can run, and a
// switch that defaulted off would leave a fresh deploy silently dead. Set
// AGENT_SEARCH_ENABLED=false (or 0, off, no) to pause it: new questions are
// refused and the entry points hide, while members can still read and
// delete their conversations.

const ON = new Set(['true', '1', 'on', 'yes'])
const OFF = new Set(['false', '0', 'off', 'no'])

export function agentSearchLaunched(env: NodeJS.ProcessEnv = process.env) {
  const value = env.AGENT_SEARCH_LAUNCHED?.trim().toLowerCase()
  return Boolean(value) && ON.has(value!)
}

export function agentSearchEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.AGENT_SEARCH_ENABLED?.trim().toLowerCase()
  return !value || !OFF.has(value)
}
