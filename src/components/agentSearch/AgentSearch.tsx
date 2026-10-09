'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@ai-sdk/workflow/client'
import type { UIMessage } from 'ai'
import { ArrowUp, MessageSquareText, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { ConversationSummary } from '@/lib/agentSearch/history'
import { AgentSearchTurn } from './AgentSearchTurn'
import { EvidenceBoundary } from './EvidenceBoundary'
import { RecentConversations } from './RecentConversations'
import { RunStatus } from './RunStatus'
import { InterruptedNote } from './InterruptedNote'
import {
  buildTurnView,
  describeChatError,
  messageText,
  type TurnView,
} from './messageView'

export const EXAMPLE_QUESTIONS = [
  'What has @patio11 said about stablecoins?',
  'Who has complained or criticized the community archive?',
  'What do people here say about burnout and recovery?',
  'How have people described the move from Twitter to Bluesky?',
]

const MAX_QUESTION_LENGTH = 1000

const newConversationId = () => crypto.randomUUID()

const questionAnchor = (messageId: string) => `ask-question-${messageId}`

/** Points the address bar at a conversation (or none) without a navigation. */
function showConversationInUrl(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('c', id)
  else url.searchParams.delete('c')
  window.history.replaceState(window.history.state, '', url)
}

interface Quota {
  limit: number
  remaining: number
  /** ISO time the daily count starts over (UTC midnight). */
  resetsAt: string
}

const resetTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

interface Conversation {
  /** Also the chat id the server stores runs under. */
  id: string
  /** Messages to load once the chat for this id exists. */
  pending: UIMessage[] | null
  /** A run of this conversation that is still answering. */
  runningRunId: string | null
}

export default function AgentSearch({
  initialConversationId = null,
}: {
  initialConversationId?: string | null
}) {
  const [conversation, setConversation] = useState<Conversation>(() => ({
    id: initialConversationId ?? newConversationId(),
    pending: null,
    runningRunId: null,
  }))
  const [loading, setLoading] = useState(Boolean(initialConversationId))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recent, setRecent] = useState<ConversationSummary[] | null>(null)
  // Client clock when the current answer was asked for (or reopened), for the
  // status row's timer.
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [quota, setQuota] = useState<Quota | null>(null)
  const [input, setInput] = useState('')
  // Questions stopped in this visit, by question message id, with how long
  // they had run (null when the start time is unknown).
  const [stopped, setStopped] = useState<Record<string, number | null>>({})

  // The run id of the answer in progress, so Stop can cancel the workflow
  // instead of only closing the stream, and a reopened conversation can
  // reconnect to an answer that is still being written.
  const runIdRef = useRef<string | null>(null)
  const transport = useMemo(
    () =>
      new WorkflowChatTransport<UIMessage>({
        api: '/api/agent-search',
        // The transport sends only messages by default; the server files the
        // run under the chat id, which is the conversation id.
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: { ...body, id, messages },
        }),
        onChatSendMessage: (response, { chatId }) => {
          runIdRef.current = response.headers.get('x-workflow-run-id')
          // Only an accepted question makes the conversation worth linking to.
          if (response.ok) showConversationInUrl(chatId)
        },
        onChatEnd: () => {
          runIdRef.current = null
        },
        prepareReconnectToStreamRequest: ({ api }) => ({
          api: runIdRef.current
            ? `/api/agent-search/${encodeURIComponent(runIdRef.current)}/stream`
            : api,
        }),
      }),
    [],
  )
  const {
    messages,
    setMessages,
    sendMessage,
    resumeStream,
    status,
    error,
    clearError,
    stop,
  } = useChat({ id: conversation.id, transport })

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetch('/api/agent-search/conversations', {
        cache: 'no-store',
      })
      if (!response.ok) return
      const body = (await response.json()) as {
        conversations?: ConversationSummary[]
        dailyLimit?: number
        remainingToday?: number
        resetsAt?: string
      }
      setRecent(body.conversations ?? [])
      if (
        typeof body.dailyLimit === 'number' &&
        typeof body.remainingToday === 'number' &&
        typeof body.resetsAt === 'string'
      ) {
        setQuota({
          limit: body.dailyLimit,
          remaining: body.remainingToday,
          resetsAt: body.resetsAt,
        })
      }
    } catch {
      // The list is a convenience; the page works without it.
    }
  }, [])

  const openConversation = useCallback(async (id: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(
        `/api/agent-search/conversations/${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      )
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as {
        messages: UIMessage[]
        runningRunId: string | null
      }
      setConversation({
        id,
        pending: body.messages,
        runningRunId: body.runningRunId,
      })
      // A draft from another conversation would be sent into this one.
      setInput('')
      showConversationInUrl(id)
    } catch {
      setLoadError('That conversation could not be opened.')
      setConversation({
        id: newConversationId(),
        pending: [],
        runningRunId: null,
      })
      showConversationInUrl(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Messages load after the chat for the new id exists, so they land in it.
  useEffect(() => {
    if (!conversation.pending) return
    setMessages(conversation.pending)
    if (conversation.runningRunId) {
      runIdRef.current = conversation.runningRunId
      setRunStartedAt(Date.now())
      void resumeStream()
    }
    setConversation((current) =>
      current.id === conversation.id
        ? { ...current, pending: null, runningRunId: null }
        : current,
    )
  }, [conversation, setMessages, resumeStream])

  useEffect(() => {
    if (initialConversationId) void openConversation(initialConversationId)
  }, [initialConversationId, openConversation])

  // Refresh the list and the quota on arrival, whenever an answer finishes,
  // and after a refusal.
  useEffect(() => {
    if (status === 'ready' || status === 'error') void loadRecent()
  }, [status, loadRecent])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()
  const hintId = useId()

  const busy = status === 'submitted' || status === 'streaming'
  const scrollToQuestionRef = useRef(false)
  const outOfQuestions =
    quota !== null &&
    quota.remaining <= 0 &&
    Date.now() < Date.parse(quota.resetsAt)
  // A stream that breaks after the answer began is shown on its turn, with
  // Ask again; only a refused question is reported under the composer.
  const lastMessage = messages[messages.length - 1]
  const answerFailed = Boolean(error) && lastMessage?.role === 'assistant'
  const errorMessage = answerFailed
    ? null
    : describeChatError(
        error,
        quota
          ? { limit: quota.limit, resetLabel: resetTime(quota.resetsAt) }
          : undefined,
      )

  // A refused POST (limit, eligibility) leaves the question with no reply.
  // Drop it from the thread and put it back in the box so nothing is lost.
  useEffect(() => {
    if (!error) return
    const last = messages[messages.length - 1]
    if (last?.role !== 'user') return
    setMessages((current) => current.slice(0, -1))
    setInput((value) => value || messageText(last))
    textareaRef.current?.focus()
  }, [error, messages, setMessages])

  const stopRun = () => {
    const runId = runIdRef.current
    runIdRef.current = null
    if (runId) {
      void fetch(`/api/agent-search/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
      }).catch(() => undefined)
    }
    void stop()
  }

  // Stop as the member sees it: remember when and on which question, then
  // cancel the run.
  const stopFromStatus = () => {
    const question = [...messages].reverse().find((m) => m.role === 'user')
    if (question) {
      setStopped((current) => ({
        ...current,
        [question.id]: runStartedAt === null ? null : Date.now() - runStartedAt,
      }))
    }
    stopRun()
  }

  const ask = (question: string) => {
    const text = question.trim().slice(0, MAX_QUESTION_LENGTH)
    if (!text || busy || loading) return
    if (error) clearError()
    setLoadError(null)
    setInput('')
    setRunStartedAt(Date.now())
    // Shown at once; the next refresh replaces it with the stored count.
    setQuota((current) =>
      current ? { ...current, remaining: Math.max(0, current.remaining - 1) } : current,
    )
    // A follow-up sent from the bottom of a long answer would otherwise
    // start below the fold.
    scrollToQuestionRef.current = messages.length > 0
    void sendMessage({ text })
  }

  // Bring the new question to the top once, right after it is sent; later
  // scrolling is the member's.
  useEffect(() => {
    if (!scrollToQuestionRef.current) return
    const last = messages[messages.length - 1]
    if (last?.role !== 'user') return
    scrollToQuestionRef.current = false
    document
      .getElementById(questionAnchor(last.id))
      ?.scrollIntoView({ block: 'start' })
  }, [messages])

  const startNewConversation = () => {
    if (busy) return
    if (error) clearError()
    setLoadError(null)
    setConversation({
      id: newConversationId(),
      pending: [],
      runningRunId: null,
    })
    showConversationInUrl(null)
    textareaRef.current?.focus()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    ask(input)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      ask(input)
    }
  }

  const hasThread = messages.length > 0
  const lastIndex = messages.length - 1
  // Each answer's view, by message index; a question needs its reply's.
  const views = new Map<number, TurnView>()
  messages.forEach((message, index) => {
    if (message.role !== 'assistant') return
    views.set(
      index,
      buildTurnView(messages, index, {
        streaming: busy && index === lastIndex,
      }),
    )
  })

  const form = (
    <form onSubmit={onSubmit} className="w-full">
      <label
        htmlFor={inputId}
        className={
          hasThread
            ? 'sr-only'
            : 'mb-2 block text-sm font-medium text-foreground'
        }
      >
        {hasThread ? 'Ask a follow-up question' : 'Your question'}
      </label>
      <div className="flex items-end gap-2 rounded-lg border border-border bg-card p-2 focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          id={inputId}
          aria-describedby={hintId}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_QUESTION_LENGTH}
          rows={hasThread ? 2 : 3}
          disabled={busy || outOfQuestions}
          placeholder={
            busy
              ? 'You can ask a follow-up when this answer finishes'
              : outOfQuestions && quota
                ? `You’ve used today’s ${quota.limit} questions. More at ${resetTime(quota.resetsAt)}`
                : hasThread
                  ? 'Ask a follow-up'
                  : 'Ask about what people in the archive have said'
          }
          className="min-h-[3rem] flex-1 resize-y bg-transparent px-2 py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        />
        {/* Stop lives in the status row above the answer, not here. */}
        {!busy && !outOfQuestions && (
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
            Ask
          </button>
        )}
      </div>
      <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
        {quota && (
          <span className={outOfQuestions ? 'text-foreground' : undefined}>
            {quota.remaining} of {quota.limit}{' '}
            {quota.limit === 1 ? 'question' : 'questions'} left today ·{' '}
          </span>
        )}
        Answers are private to you.
        {/* Touch keyboards have no Shift+Enter habit to explain. */}
        <span className="[@media(pointer:coarse)]:hidden">
          {' '}
          Enter to send, Shift+Enter for a new line.
        </span>
      </p>
      {errorMessage && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-sm text-foreground"
        >
          {errorMessage}
        </p>
      )}
    </form>
  )

  return (
    <main className="min-h-screen bg-background">
      <section
        className={`mx-auto w-full px-4 py-8 sm:px-6 sm:py-12 ${
          hasThread ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        <div className={hasThread ? 'mb-6' : 'mb-8'}>
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
            Members
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1
              className={`font-bold tracking-tight text-foreground ${
                hasThread ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'
              }`}
            >
              Ask the archive
            </h1>
            {hasThread && (
              <button
                type="button"
                onClick={startNewConversation}
                disabled={busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                New question
              </button>
            )}
          </div>
          {!hasThread && (
            <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
              An agent searches members’ tweets, follows threads and quotes, and
              writes a short answer. Every claim links to the tweet it came
              from.
            </p>
          )}
        </div>

        {loadError && (
          <p
            role="alert"
            className="mb-6 rounded-md border border-destructive/40 px-3 py-2 text-sm text-foreground"
          >
            {loadError}
          </p>
        )}

        {!hasThread && loading && (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Opening the conversation
          </p>
        )}

        {!hasThread && !loading && (
          <>
            {form}
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                Try one of these
              </h2>
              <ul className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <li key={question}>
                    {/* Fills the box rather than sending: one tap should not
                        spend one of the day's questions. */}
                    <button
                      type="button"
                      onClick={() => {
                        setInput(question)
                        textareaRef.current?.focus()
                      }}
                      disabled={busy}
                      className="rounded-full border border-border bg-background px-3.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <RecentConversations
              conversations={recent}
              onOpen={(id) => void openConversation(id)}
            />
          </>
        )}

        {hasThread && (
          <div className="space-y-10">
            {messages.map((message, index) => {
              if (message.role === 'user') {
                const waiting = busy && index === lastIndex
                const reply =
                  messages[index + 1]?.role === 'assistant' ? index + 1 : null
                const replyView = reply === null ? null : views.get(reply)
                const stoppedHere = message.id in stopped
                const failedHere =
                  answerFailed && reply === lastIndex && !stoppedHere
                const interrupted: 'stopped' | 'failed' | null = waiting
                  ? null
                  : stoppedHere || replyView?.outcome === 'stopped'
                    ? 'stopped'
                    : failedHere || replyView?.outcome === 'failed'
                      ? 'failed'
                      : null
                const question = messageText(message)
                return (
                  <div
                    key={message.id}
                    className="space-y-5 border-t border-border pt-6 first:border-t-0 first:pt-0"
                  >
                    <h2
                      id={questionAnchor(message.id)}
                      className="scroll-mt-24 whitespace-pre-wrap break-words text-xl font-semibold leading-snug text-foreground"
                    >
                      {question}
                    </h2>
                    {waiting && (
                      <RunStatus
                        startedAt={runStartedAt ?? Date.now()}
                        found={0}
                        writing={false}
                        onStop={stopFromStatus}
                      />
                    )}
                    {interrupted && (
                      <InterruptedNote
                        kind={interrupted}
                        elapsedMs={stopped[message.id] ?? null}
                        found={replyView?.foundSoFar ?? 0}
                        dailyLimit={quota?.limit ?? null}
                        canAskAgain={!busy && !loading && !outOfQuestions}
                        onAskAgain={() => ask(question)}
                      />
                    )}
                  </div>
                )
              }
              if (message.role !== 'assistant') return null
              const active = busy && index === lastIndex
              const view = views.get(index) as TurnView
              return (
                <div key={message.id} className="space-y-5">
                  {active && (
                    <RunStatus
                      startedAt={runStartedAt ?? Date.now()}
                      found={view.foundSoFar}
                      writing={Boolean(view.answer.markdown.trim())}
                      onStop={stopFromStatus}
                    />
                  )}
                  <EvidenceBoundary
                    label="turn"
                    fallback="This answer could not be shown."
                  >
                    <AgentSearchTurn view={view} active={active} />
                  </EvidenceBoundary>
                </div>
              )
            })}
          </div>
        )}

        {hasThread &&<div className="mt-10 max-w-3xl">{form}</div>}
      </section>
    </main>
  )
}
