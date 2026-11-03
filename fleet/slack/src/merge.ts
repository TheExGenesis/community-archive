// The merge guard: who may click, what state the PR must be in, and that no
// Tier 1 path is touched. Pure; the caller fetches the facts.
import type { PrFacts } from './fleetTask.js'

export interface MergeDecisionInput {
  userId: string
  allowedUserIds: Set<string>
  pr: PrFacts
  /** From fleet/bin/task.sh tier1-paths over the PR's files. */
  tier1Violations: string[]
  baseBranch: string
}

export interface MergeDecision {
  ok: boolean
  reasons: string[]
  /** Checks still running (a retry may succeed later). */
  pending: boolean
}

const GREEN_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

export function checksState(pr: PrFacts): 'green' | 'pending' | 'red' | 'none' {
  const checks = pr.statusCheckRollup || []
  if (checks.length === 0) return 'none'
  let pending = false
  for (const c of checks) {
    if (c.state !== undefined && c.__typename === 'StatusContext') {
      if (c.state === 'PENDING' || c.state === 'EXPECTED') pending = true
      else if (c.state !== 'SUCCESS') return 'red'
      continue
    }
    const status = String(c.status || '').toUpperCase()
    const conclusion = String(c.conclusion || '').toUpperCase()
    if (status && status !== 'COMPLETED') {
      pending = true
      continue
    }
    if (!GREEN_CONCLUSIONS.has(conclusion)) return 'red'
  }
  return pending ? 'pending' : 'green'
}

export function evaluateMerge(i: MergeDecisionInput): MergeDecision {
  const reasons: string[] = []
  let pending = false
  if (!i.allowedUserIds.has(i.userId)) {
    reasons.push('only the allowed maintainers can merge')
  }
  if (i.pr.state !== 'OPEN')
    reasons.push(`PR is ${i.pr.state || 'in an unknown state'}, not open`)
  if (i.pr.isDraft) reasons.push('PR is a draft')
  if (!i.pr.headRefName.startsWith('fleet/')) {
    reasons.push(`branch ${i.pr.headRefName || '?'} is not a fleet branch`)
  }
  if (i.pr.baseRefName && i.pr.baseRefName !== i.baseBranch) {
    reasons.push(`PR targets ${i.pr.baseRefName}, not ${i.baseBranch}`)
  }
  if (i.pr.mergeable !== 'MERGEABLE') {
    if (i.pr.mergeable === 'UNKNOWN') {
      pending = true
      reasons.push(
        'GitHub has not computed mergeability yet; try again in a moment',
      )
    } else {
      reasons.push(`PR is ${i.pr.mergeable || 'not mergeable'} (conflicts?)`)
    }
  }
  const checks = checksState(i.pr)
  if (checks === 'pending') {
    pending = true
    reasons.push('CI is still running')
  } else if (checks === 'red') {
    reasons.push('CI is red')
  } else if (checks === 'none') {
    pending = true
    reasons.push('no CI check has reported yet')
  }
  if (i.tier1Violations.length) {
    reasons.push(
      `Tier 1: ${i.tier1Violations.join('; ')} (a human merges this one)`,
    )
  }
  return {
    ok: reasons.length === 0,
    reasons,
    pending: reasons.length > 0 && pending,
  }
}
