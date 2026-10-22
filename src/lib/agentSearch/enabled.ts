// The switch for pausing Ask the archive without a deploy. Unset means on:
// the feature already needs migrations and keys before it can run, and a
// switch that defaulted off would leave a fresh deploy silently dead. Set
// AGENT_SEARCH_ENABLED=false (or 0, off, no) to pause it: new questions are
// refused and the entry points hide, while members can still read and
// delete their conversations.

const OFF = new Set(['false', '0', 'off', 'no'])

export function agentSearchEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.AGENT_SEARCH_ENABLED?.trim().toLowerCase()
  return !value || !OFF.has(value)
}
