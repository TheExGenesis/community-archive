'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@ai-sdk/workflow/client'
import type { UIMessage } from 'ai'
import { ArrowUp, Lock, Plus, Quote } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { ConversationSummary } from '@/lib/agentSearch/history'
import { OWN_KEY_HEADER } from '@/lib/agentSearch/ownKey'
import { ownKeyRefusalMessage } from './OwnKeyControl'
import { readOwnKey, useOwnKey } from './ownKeyStore'
import { QuestionsLeft, type QuestionsToday } from './QuestionsLeft'
import { AgentSearchTurn, type TurnInterruption } from './AgentSearchTurn'
import { EvidenceBoundary } from './EvidenceBoundary'
import { RecentConversations } from './RecentConversations'
import { StepLog } from './StepLog'
import { Skeleton } from '@/components/ui/skeleton'
import { ConversationHistory, GHOST_BUTTON } from './ConversationHistory'
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
  // Null state, not window.history.state: Next's router skips entries that
  // carry its own marker, then puts its old URL back on the next render.
  window.history.replaceState(null, '', url)
}

interface Quota {
  limit: number
  remaining: number
  /** ISO time the daily count starts over (UTC midnight). */
  resetsAt: string
  /** The member may pay with their own OpenRouter key. */
  ownKeyEnabled: boolean
  /** The same count on one's own key: a higher limit, all questions counted. */
  ownLimit: number | null
  ownRemaining: number | null
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
  const [houseQuota, setQuota] = useState<Quota | null>(null)
  const [hasOwnKey] = useOwnKey()
  // Questions go out on the member's key only while the server allows it.
  const ownKeyEnabledRef = useRef(true)
  // The count that applies to the next question: on the member's own key
  // when this browser holds one, otherwise the house's.
  const onOwnKey =
    hasOwnKey &&
    houseQuota !== null &&
    houseQuota.ownKeyEnabled &&
    houseQuota.ownLimit !== null &&
    houseQuota.ownRemaining !== null
  const quota =
    houseQuota && onOwnKey
      ? {
          ...houseQuota,
          limit: houseQuota.ownLimit ?? houseQuota.limit,
          remaining: houseQuota.ownRemaining ?? houseQuota.remaining,
        }
      : houseQuota
  const [input, setInput] = useState('')
  // Questions stopped in this visit, by question message id, with how long
  // they had run (null when the start time is unknown).
  const [stopped, setStopped] = useState<Record<string, number | null>>({})

  // The run id of the answer in progress, so Stop can cancel the workflow
  // instead of only closing the stream, and a reopened conversation can
  // reconnect to an answer that is still being written.
  const runIdRef = useRef<string | null>(null)
  // Stop pressed before the server returned the run id: cancel as soon as it
  // arrives (stopRun reads this when onChatSendMessage calls it).
  const stopPendingRef = useRef(false)
  const stopRunRef = useRef<() => void>(() => {})
  // The conversation on screen, or loading. Sending puts its id in the URL,
  // and a server render of the page (Fast Refresh in development, a router
  // refresh) then passes it back as initialConversationId: reopening it would
  // resume the run a second time while the first stream is still being read,
  // and two streams into one chat push copies of the answer.
  const shownConversationRef = useRef<string | null>(null)
  // Whether the chat is reading a stream, for effects that must not start
  // another one.
  const busyRef = useRef(false)
  const transport = useMemo(
    () =>
      new WorkflowChatTransport<UIMessage>({
        api: '/api/agent-search',
        // Only the chat id (the conversation id) and the new question: the
        // server rebuilds earlier turns from what it stored.
        prepareSendMessagesRequest: ({ id, messages }) => {
          stopPendingRef.current = false
          const last = [...messages].reverse().find((m) => m.role === 'user')
          const body = { id, question: last ? messageText(last) : '' }
          // The member's own key, if this browser holds one, pays for the
          // question; it travels in a header and the server never stores it.
          const ownKey = ownKeyEnabledRef.current ? readOwnKey() : null
          return ownKey
            ? { body, headers: { [OWN_KEY_HEADER]: ownKey } }
            : { body }
        },
        onChatSendMessage: (response, { chatId }) => {
          runIdRef.current = response.headers.get('x-workflow-run-id')
          shownConversationRef.current = chatId
          // Only an accepted question makes the conversation worth linking to.
          if (response.ok) showConversationInUrl(chatId)
          if (stopPendingRef.current) stopRunRef.current()
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
        ownKeyEnabled?: boolean
        ownKeyDailyLimit?: number
        ownKeyRemainingToday?: number
      }
      setRecent(body.conversations ?? [])
      if (
        typeof body.dailyLimit === 'number' &&
        typeof body.remainingToday === 'number' &&
        typeof body.resetsAt === 'string'
      ) {
        ownKeyEnabledRef.current = body.ownKeyEnabled === true
        setQuota({
          limit: body.dailyLimit,
          remaining: body.remainingToday,
          resetsAt: body.resetsAt,
          ownKeyEnabled: body.ownKeyEnabled === true,
          ownLimit:
            typeof body.ownKeyDailyLimit === 'number'
              ? body.ownKeyDailyLimit
              : null,
          ownRemaining:
            typeof body.ownKeyRemainingToday === 'number'
              ? body.ownKeyRemainingToday
              : null,
        })
      }
    } catch {
      // The list is a convenience; the page works without it.
    }
  }, [])

  const openConversation = useCallback(async (id: string) => {
    shownConversationRef.current = id
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
      const fresh = newConversationId()
      shownConversationRef.current = fresh
      setConversation({ id: fresh, pending: [], runningRunId: null })
      showConversationInUrl(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Messages load after the chat for the new id exists, so they land in it.
  useEffect(() => {
    if (!conversation.pending) return
    setMessages(conversation.pending)
    if (conversation.runningRunId && !busyRef.current) {
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
    if (
      initialConversationId &&
      initialConversationId !== shownConversationRef.current
    ) {
      void openConversation(initialConversationId)
    }
  }, [initialConversationId, openConversation])

  // Refresh the list and the quota on arrival, whenever an answer finishes,
  // and after a refusal.
  useEffect(() => {
    if (status === 'ready' || status === 'error') void loadRecent()
  }, [status, loadRecent])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()

  const busy = status === 'submitted' || status === 'streaming'
  busyRef.current = busy
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
    : (ownKeyRefusalMessage(error) ??
      describeChatError(
        error,
        quota
          ? { limit: quota.limit, resetLabel: resetTime(quota.resetsAt) }
          : undefined,
      ))

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

  // Stop cancels the workflow, not just the stream. Until the server has
  // returned the run id, aborting the request would leave the run going with
  // no way to cancel it, so Stop is remembered and runs again when the id
  // arrives. A cancel that fails keeps the id, so Stop can be pressed again.
  const stopRun = () => {
    const runId = runIdRef.current
    if (!runId && status === 'submitted') {
      stopPendingRef.current = true
      return
    }
    stopPendingRef.current = false
    if (runId) {
      void fetch(`/api/agent-search/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
      })
        .then((response) => {
          if (response.ok && runIdRef.current === runId) {
            runIdRef.current = null
          }
        })
        .catch(() => undefined)
    }
    void stop()
  }
  stopRunRef.current = stopRun

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
      current
        ? { ...current, remaining: Math.max(0, current.remaining - 1) }
        : current,
    )
    // A follow-up sent from the bottom of a long answer would otherwise
    // start below the fold.
    scrollToQuestionRef.current = messages.length > 0
    void sendMessage({ text })
  }

  // A member waiting a minute switches tabs: say in the tab title that the
  // answer is ready, and put the title back when they return.
  const wasBusyRef = useRef(false)
  useEffect(() => {
    if (busy) {
      wasBusyRef.current = true
      return
    }
    if (!wasBusyRef.current) return
    wasBusyRef.current = false
    if (status !== 'ready' || !document.hidden) return
    const original = document.title
    document.title = 'Answer ready · Ask the archive'
    const restore = () => {
      if (document.hidden) return
      document.title = original
      document.removeEventListener('visibilitychange', restore)
    }
    document.addEventListener('visibilitychange', restore)
    return () => {
      document.removeEventListener('visibilitychange', restore)
      document.title = original
    }
  }, [busy, status])

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
    const fresh = newConversationId()
    shownConversationRef.current = fresh
    setConversation({ id: fresh, pending: [], runningRunId: null })
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

  const quotaLow = quota !== null && quota.remaining <= 3
  const today: QuestionsToday | null = quota && {
    limit: quota.limit,
    remaining: quota.remaining,
    resetLabel: resetTime(quota.resetsAt),
    ownKey: onOwnKey,
    ownKeyEnabled: quota.ownKeyEnabled,
    ownLimit: quota.ownLimit,
  }
  const limitSentence = quota
    ? `You’ve used today’s ${quota.limit} questions. You can ask again at ${resetTime(quota.resetsAt)}.`
    : null
  const canAskAgain = !busy && !loading && !outOfQuestions

  const errorNote = errorMessage && (
    <p
      role="alert"
      className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-sm text-foreground"
    >
      {errorMessage}
    </p>
  )

  const textarea = (rows: number, placeholder: string, className: string) => (
    <textarea
      ref={textareaRef}
      id={inputId}
      value={input}
      onChange={(event) => setInput(event.target.value)}
      onKeyDown={onKeyDown}
      maxLength={MAX_QUESTION_LENGTH}
      rows={rows}
      placeholder={placeholder}
      className={`resize-none bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none ${className}`}
    />
  )

  // First visit: the facts that qualify asking sit beside the box, as the
  // daily count sits beside Ask.
  const startForm = (
    <form onSubmit={onSubmit} className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Your question
      </label>
      <div className="rounded-xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring">
        {textarea(
          3,
          'Ask about members’ tweets',
          'block w-full px-4 pb-1 pt-3.5',
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 pt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Lock aria-hidden="true" className="h-3.5 w-3.5" />
            Private to you
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Quote aria-hidden="true" className="h-3.5 w-3.5" />
            Answers cite tweets
          </span>
          <span className="ml-auto flex items-center gap-3">
            {today && <QuestionsLeft today={today} />}
            <button
              type="submit"
              disabled={!input.trim()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
              Ask
            </button>
          </span>
        </div>
      </div>
      {errorNote}
    </form>
  )

  // In a thread: one line, and the count only once few questions remain.
  const threadForm = (
    <form onSubmit={onSubmit} className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Ask a follow-up
      </label>
      <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-1.5 pl-3 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        {textarea(
          input.includes('\n') ? 3 : 1,
          'Ask a follow-up',
          'min-h-[2.25rem] flex-1 py-1.5',
        )}
        <button
          type="submit"
          aria-label="Ask"
          disabled={!input.trim()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUp aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {quotaLow && today && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          <QuestionsLeft today={today} />
        </p>
      )}
      {errorNote}
    </form>
  )

  // Out of house questions, the member's own key is the way to keep going.
  const limitNote = (
    <div className="space-y-1 text-sm leading-6 text-muted-foreground">
      <p>{limitSentence}</p>
      {today?.ownKeyEnabled && !onOwnKey && (
        <p>
          <QuestionsLeft
            today={today}
            trigger="Use your own OpenRouter key"
            className="text-foreground underline decoration-muted-foreground/50"
          />{' '}
          to ask up to {today.ownLimit?.toLocaleString('en-US') ?? 'more'} a
          day.
        </p>
      )}
    </div>
  )

  const inThread = hasThread || loading

  return (
    <main className="min-h-screen bg-background">
      <section
        className={`mx-auto w-full px-4 py-8 sm:px-6 sm:py-12 ${
          inThread ? 'max-w-[84rem]' : 'max-w-2xl'
        }`}
      >
        {inThread ? (
          <div className="mb-6 flex min-h-[2.5rem] flex-wrap items-center justify-between gap-2">
            <h1 className="text-[15px] font-semibold text-foreground [font-family:inherit]">
              Ask the archive
            </h1>
            <div className="-mr-2.5 flex items-center gap-1">
              <ConversationHistory
                conversations={recent}
                currentId={conversation.id}
                onOpen={(id) => void openConversation(id)}
                disabled={busy || loading}
              />
              <button
                type="button"
                onClick={startNewConversation}
                disabled={busy}
                className={GHOST_BUTTON}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                New question
              </button>
            </div>
          </div>
        ) : (
          <h1 className="mb-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Ask the archive
          </h1>
        )}

        {loadError && (
          <p
            role="alert"
            className="mb-6 rounded-md border border-destructive/40 px-3 py-2 text-sm text-foreground"
          >
            {loadError}
          </p>
        )}

        {loading && (
          <div
            role="status"
            aria-label="Opening the conversation"
            className="max-w-3xl space-y-4"
          >
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}

        {!inThread && (
          <>
            {outOfQuestions ? limitNote : startForm}
            {/* Suggestions, not history: chips under the box that fill it
                rather than send, since one tap should not spend one of the
                day's questions. */}
            <ul
              aria-label="Questions to try"
              className="mt-4 flex flex-wrap gap-2"
            >
              {EXAMPLE_QUESTIONS.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => {
                      setInput(question)
                      textareaRef.current?.focus()
                    }}
                    className="rounded-full border border-border px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
            <RecentConversations
              conversations={recent}
              onOpen={(id) => void openConversation(id)}
            />
          </>
        )}

        {hasThread && !loading && (
          <div className="space-y-10">
            {messages.map((message, index) => {
              if (message.role === 'user') {
                const reply =
                  messages[index + 1]?.role === 'assistant' ? index + 1 : null
                const waiting = busy && index === lastIndex
                // Ended before any reply arrived: stopped, or the stream
                // broke. A refused question is taken back out of the thread.
                const endedEarly: 'stopped' | 'failed' | null =
                  reply !== null || waiting
                    ? null
                    : message.id in stopped
                      ? 'stopped'
                      : Boolean(error) && index === lastIndex
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
                      className="scroll-mt-24 whitespace-pre-wrap break-words text-2xl font-semibold leading-snug text-foreground sm:text-3xl"
                    >
                      {question}
                    </h2>
                    {waiting && (
                      <StepLog
                        mode="running"
                        steps={[]}
                        startedAt={runStartedAt ?? Date.now()}
                        onStop={stopFromStatus}
                      />
                    )}
                    {endedEarly && (
                      <StepLog
                        mode={endedEarly}
                        steps={[]}
                        elapsedMs={stopped[message.id] ?? null}
                        onAskAgain={() => ask(question)}
                        canAskAgain={canAskAgain}
                      />
                    )}
                  </div>
                )
              }
              if (message.role !== 'assistant') return null
              const active = busy && index === lastIndex
              const view = views.get(index) as TurnView
              const asked =
                messages[index - 1]?.role === 'user'
                  ? messages[index - 1]
                  : null
              const interrupted: TurnInterruption | null = active
                ? null
                : asked && asked.id in stopped
                  ? { kind: 'stopped', elapsedMs: stopped[asked.id] }
                  : answerFailed && index === lastIndex
                    ? { kind: 'failed', elapsedMs: null }
                    : null
              return (
                <div key={message.id}>
                  <EvidenceBoundary
                    label="turn"
                    fallback="This answer could not be shown."
                  >
                    <AgentSearchTurn
                      view={view}
                      active={active}
                      interrupted={interrupted}
                      startedAt={runStartedAt ?? Date.now()}
                      onStop={stopFromStatus}
                      onAskAgain={
                        asked ? () => ask(messageText(asked)) : undefined
                      }
                      canAskAgain={canAskAgain}
                      showSources={
                        index === lastIndex ||
                        interrupted?.kind === 'stopped' ||
                        view.outcome === 'stopped'
                      }
                    />
                  </EvidenceBoundary>
                </div>
              )
            })}
          </div>
        )}

        {/* Pinned to the bottom of the screen while reading a thread; it
            settles into place below the last turn. Hidden while a question
            runs: Stop, in the step log, is the only action then. */}
        {hasThread && !loading && !busy && (
          <div className="sticky bottom-0 z-30 -mx-4 mt-10 max-w-[calc(48rem+2rem)] bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:max-w-[calc(48rem+3rem)] sm:px-6 lg:mr-[23rem] lg:max-w-[calc(48rem+3rem)]">
            {outOfQuestions ? limitNote : threadForm}
          </div>
        )}
      </section>
    </main>
  )
}
