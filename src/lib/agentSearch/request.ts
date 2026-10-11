export const MAX_QUESTION_CHARS = 1000
// The page's chat id, which groups a question with its follow-ups.
export const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/

/**
 * The start route's body is `{ id, question }`: the conversation id and the
 * new question. Earlier turns are never taken from the browser; the workflow
 * rebuilds them from the run store (context.ts).
 */
export function parseAgentSearchRequest(
  body: unknown,
): { conversationId: string; question: string } | null {
  if (!body || typeof body !== 'object') return null
  const { id, question } = body as { id?: unknown; question?: unknown }
  if (typeof id !== 'string' || !CONVERSATION_ID_PATTERN.test(id)) return null
  if (typeof question !== 'string') return null
  const trimmed = question.trim()
  if (!trimmed || trimmed.length > MAX_QUESTION_CHARS) return null
  return { conversationId: id, question: trimmed }
}
