import type { UIMessage } from 'ai'
import type { AgentSearchRun, AgentTweet } from './types'

// Past answers outlive Workflow's own run data (7 days after a run ends on
// Vercel Pro), so each run stores its answer as UI message parts. Tweets are
// stored as references, not copies: opening a past answer fetches them again
// through the gateway, so a member who opts out later drops out of old
// answers too.

/** A tweet reduced to its id, plus the classifier score when it had one. */
export interface TweetRef {
  $t: string
  p?: number
}

type LooseRecord = Record<string, unknown>

const isRecord = (value: unknown): value is LooseRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function isTweet(value: LooseRecord): boolean {
  return (
    typeof value.id === 'string' &&
    /^\d{1,20}$/.test(value.id) &&
    typeof value.text === 'string' &&
    typeof value.username === 'string'
  )
}

const isRef = (value: unknown): value is TweetRef =>
  isRecord(value) && typeof value.$t === 'string'

/** Replaces every tweet object (and anything nested in it) with a TweetRef. */
export function dehydrate(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dehydrate)
  if (!isRecord(value)) return value
  if (isTweet(value)) {
    const ref: TweetRef = { $t: value.id as string }
    if (typeof value.p === 'number') ref.p = value.p
    return ref
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [key, dehydrate(inner)]),
  )
}

export function collectRefs(value: unknown, ids = new Set<string>()) {
  if (Array.isArray(value)) value.forEach((inner) => collectRefs(inner, ids))
  else if (isRef(value)) ids.add(value.$t)
  else if (isRecord(value))
    Object.values(value).forEach((inner) => collectRefs(inner, ids))
  return ids
}

/**
 * Puts tweets back in place of refs. A ref whose tweet is gone (deleted or
 * opted out) is dropped from arrays and becomes null elsewhere.
 */
export function rehydrate(
  value: unknown,
  tweets: Map<string, AgentTweet>,
): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((inner) => !isRef(inner) || tweets.has(inner.$t))
      .map((inner) => rehydrate(inner, tweets))
  }
  if (isRef(value)) {
    const tweet = tweets.get(value.$t)
    if (!tweet) return null
    return value.p === undefined ? tweet : { ...tweet, p: value.p }
  }
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      rehydrate(inner, tweets),
    ]),
  )
}

export interface StepLike {
  text?: string
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>
  toolResults: Array<{ toolCallId: string; output: unknown }>
}

/**
 * People lookups keep only handles: the page shows just how many matched, and
 * profile text (bios) should not outlive a member's opt-out. The looked-up
 * account's top tweets stay, as references like every other tweet, so an
 * answer that cites one still verifies when the conversation is reopened.
 */
function slimPeople(output: unknown): unknown {
  if (!isRecord(output)) return output
  const slim = (person: unknown) =>
    isRecord(person)
      ? { accountId: person.accountId, username: person.username }
      : person
  const user = output.user
  return {
    query: output.query,
    members: Array.isArray(output.members) ? output.members.map(slim) : [],
    user: isRecord(user)
      ? {
          ...(slim(user) as LooseRecord),
          topTweets: Array.isArray(user.topTweets) ? user.topTweets : [],
        }
      : null,
  }
}

/**
 * The assistant message as the page would have built it from the stream:
 * one tool part per call, then the final answer text.
 */
export function buildRunParts(steps: StepLike[], text: string): unknown[] {
  const parts: unknown[] = []
  for (const step of steps) {
    for (const call of step.toolCalls) {
      const result = step.toolResults.find(
        (r) => r.toolCallId === call.toolCallId,
      )
      parts.push(
        result
          ? {
              type: `tool-${call.toolName}`,
              toolCallId: call.toolCallId,
              state: 'output-available',
              input: call.input,
              output:
                call.toolName === 'find_people'
                  ? slimPeople(result.output)
                  : result.output,
            }
          : {
              type: `tool-${call.toolName}`,
              toolCallId: call.toolCallId,
              state: 'output-error',
              input: call.input,
              errorText: 'Tool call failed',
            },
      )
    }
  }
  if (text) parts.push({ type: 'text', text })
  return dehydrate(parts) as unknown[]
}

export interface ConversationSummary {
  id: string
  title: string
  startedAt: string
  updatedAt: string
  turns: number
  status: AgentSearchRun['status']
}

/** Groups a member's recent runs into conversations, newest first. */
export function summarizeConversations(
  runs: AgentSearchRun[],
): ConversationSummary[] {
  const byId = new Map<string, AgentSearchRun[]>()
  for (const run of runs) {
    const id = run.conversationId
    if (!id) continue
    byId.set(id, [...(byId.get(id) ?? []), run])
  }
  return Array.from(byId.entries())
    .map(([id, group]) => {
      const ordered = [...group].sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt),
      )
      const last = ordered[ordered.length - 1]
      return {
        id,
        title: ordered[0].question,
        startedAt: ordered[0].startedAt,
        updatedAt: last.startedAt,
        turns: ordered.length,
        status: last.status,
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const STOPPED_TEXT = '_This answer was stopped before it finished._'
const FAILED_TEXT = '_This answer failed before it finished._'

/**
 * Rebuilds a conversation's messages from stored runs. `tweets` holds every
 * referenced tweet the gateway still returns. A run still in progress gets no
 * assistant message; the caller reconnects to its stream instead.
 */
export function conversationMessages(
  runs: AgentSearchRun[],
  tweets: Map<string, AgentTweet>,
): UIMessage[] {
  const messages: UIMessage[] = []
  for (const run of runs) {
    messages.push({
      id: `${run.id}-question`,
      role: 'user',
      parts: [{ type: 'text', text: run.question }],
    })
    if (run.status === 'running') continue
    const stored = Array.isArray(run.parts)
      ? (rehydrate(run.parts, tweets) as UIMessage['parts'])
      : run.answer
        ? ([{ type: 'text', text: run.answer }] as UIMessage['parts'])
        : []
    // A failed run may still have stored a partial answer; say it is one.
    const hasText = stored.some((part) => part.type === 'text')
    const note =
      run.status === 'failed'
        ? run.error?.startsWith('Stopped')
          ? STOPPED_TEXT
          : FAILED_TEXT
        : null
    const closing = note && (hasText ? `\n\n${note}` : note)
    messages.push({
      id: run.id,
      role: 'assistant',
      parts: closing ? [...stored, { type: 'text', text: closing }] : stored,
    })
  }
  return messages
}
