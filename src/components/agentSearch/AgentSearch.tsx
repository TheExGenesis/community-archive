'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@ai-sdk/workflow/client'
import type { UIMessage } from 'ai'
import { ArrowUp, Lock, Plus, Quote, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { ConversationSummary } from '@/lib/agentSearch/history'
import type { AgentTweet } from '@/lib/agentSearch/types'
import {
  ASK_PREFILL_PARAMS,
  askFilterLabel,
  questionWithFilters,
  type AskFilter,
  type AskPrefill,
} from '@/lib/askFromSearch'
import { OWN_KEY_HEADER } from '@/lib/agentSearch/ownKey'
import { ownKeyRefusalMessage } from './OwnKeyControl'
import { readOwnKey, useOwnKey } from './ownKeyStore'
import { QuestionsLeft, type QuestionsToday } from './QuestionsLeft'
import { QuestionHandling } from './QuestionHandling'
import { AgentSearchTurn, type TurnInterruption } from './AgentSearchTurn'
import { EvidenceBoundary } from './EvidenceBoundary'
import { SIDEBAR_ROOM } from './CitationSidebar'
import {
  closeCitationSidebar,
  useCitationSidebar,
} from './citationSidebarStore'
import { RecentConversations } from './RecentConversations'
import { StepLog } from './StepLog'
import { TweetLinksInNewTab } from '@/components/portal/tweetLinks'
import { Skeleton } from '@/components/ui/skeleton'
import { ConversationHistory, GHOST_BUTTON } from './ConversationHistory'
import { createReconnectingFetch } from './reconnectingFetch'
import {
  createTurnViewBuilder,
  describeChatError,
  messageText,
  type TurnView,
  type TweetLoad,
  type TweetSupply,
} from './messageView'
import {
  createTweetLoader,
  TweetRequestError,
  type BatchResult,
  type TweetLoader,
} from './tweetLoader'

export const EXAMPLE_QUESTIONS = [
  'What has @patio11 said about stablecoins?',
  'Who has complained or criticized the community archive?',
  'What do people here say about burnout and recovery?',
  'How have people described the move from Twitter to Bluesky?',
]

const MAX_QUESTION_LENGTH = 1000
/** Failed reads of a run's stream in a row before the transport gives up. */
const STREAM_READ_ATTEMPTS = 8
/** Times one run is picked up again after its stream ended early. */
const MAX_RECOVERIES = 3

const newConversationId = () => crypto.randomUUID()

const EMPTY_SUPPLY: TweetSupply = { tweets: new Map(), states: new Map() }

/** What the conversation route returns (its tweets stay as references). */
interface StoredConversation {
  messages: UIMessage[]
  runningRunId: string | null
  /** Tweets the route had time to fetch (the prose-cited ones). */
  tweets?: AgentTweet[]
  /** The rest, cited first, for the tweets route. */
  pendingTweetIds?: string[]
  /** Cited tweets the gateway no longer returns. */
  unavailableTweetIds?: string[]
}

/** One batch from the tweets route; a refusal is not tried again. */
async function fetchConversationTweets(
  conversationId: string,
  ids: string[],
  signal: AbortSignal,
): Promise<BatchResult> {
  const response = await fetch(
    `/api/agent-search/conversations/${encodeURIComponent(conversationId)}/tweets`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
      cache: 'no-store',
      signal,
    },
  )
  if (!response.ok) throw new TweetRequestError(response.status)
  const body = (await response.json()) as Partial<BatchResult>
  return {
    tweets: Array.isArray(body.tweets) ? body.tweets : [],
    failed: Array.isArray(body.failed) ? body.failed : [],
  }
}

/** The supply with a batch added: new maps, so memoized views rebuild. */
function mergeSupply(
  current: TweetSupply,
  tweets: AgentTweet[],
  states: Map<string, TweetLoad>,
): TweetSupply {
  const merged = new Map(current.tweets)
  for (const tweet of tweets) merged.set(tweet.id, tweet)
  const known = new Map(current.states)
  states.forEach((state, id) => {
    if (merged.has(id)) known.delete(id)
    else if (state === 'loading') known.delete(id)
    else known.set(id, state)
  })
  return { tweets: merged, states: known }
}

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

/** Drops a handed-over search from the address bar, so a reload asks fresh. */
function forgetPrefillInUrl() {
  const url = new URL(window.location.href)
  const before = url.search
  for (const param of ASK_PREFILL_PARAMS) url.searchParams.delete(param)
  if (url.search !== before) window.history.replaceState(null, '', url)
}

interface Quota {
  limit: number
  remaining: number
  /** ISO time the daily count starts over (UTC midnight). */
  resetsAt: string
  /** The same for the UTC month; null when the server did not say. */
  monthLimit: number | null
  monthRemaining: number | null
  monthResetsAt: string | null
  /** The member may pay with their own OpenRouter key. */
  ownKeyEnabled: boolean
  /** The same counts on one's own key: higher limits, all questions counted. */
  ownLimit: number | null
  ownRemaining: number | null
  ownMonthLimit: number | null
  ownMonthRemaining: number | null
}

/** One count a question is held to: today's, or this month's. */
interface Allowance {
  limit: number
  remaining: number
  resetsAt: string
  period: 'day' | 'month'
}

/** The count that runs out first; on a tie, the day's. */
function bindingAllowance(day: Allowance, month: Allowance | null): Allowance {
  return month && month.remaining < day.remaining ? month : day
}

const resetTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const resetDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
/** When an allowance starts over: a time today, a date for the month. */
const resetLabel = (allowance: Allowance) =>
  allowance.period === 'month'
    ? resetDate(allowance.resetsAt)
    : resetTime(allowance.resetsAt)
const numberOrNull = (value: unknown) =>
  typeof value === 'number' ? value : null

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
  initialPrefill = null,
  paused = false,
}: {
  initialConversationId?: string | null
  /** A search handed over from archive search; prefilled, never sent. */
  initialPrefill?: AskPrefill | null
  /** New questions are off (AGENT_SEARCH_ENABLED); history still works. */
  paused?: boolean
}) {
  const [conversation, setConversation] = useState<Conversation>(() => ({
    id: initialConversationId ?? newConversationId(),
    pending: null,
    runningRunId: null,
  }))
  const [loading, setLoading] = useState(Boolean(initialConversationId))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recent, setRecent] = useState<ConversationSummary[] | null>(null)
  // The list and the quota arrive together; until then both show
  // placeholders, so "no history yet" is never shown while loading.
  const [recentLoaded, setRecentLoaded] = useState(false)
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
  // The day's and the month's counts for the key in use, and the one that
  // runs out first.
  const dayAllowance: Allowance | null = houseQuota && {
    limit: onOwnKey
      ? (houseQuota.ownLimit ?? houseQuota.limit)
      : houseQuota.limit,
    remaining: onOwnKey
      ? (houseQuota.ownRemaining ?? houseQuota.remaining)
      : houseQuota.remaining,
    resetsAt: houseQuota.resetsAt,
    period: 'day',
  }
  const monthLimit = houseQuota
    ? onOwnKey
      ? houseQuota.ownMonthLimit
      : houseQuota.monthLimit
    : null
  const monthRemaining = houseQuota
    ? onOwnKey
      ? houseQuota.ownMonthRemaining
      : houseQuota.monthRemaining
    : null
  const monthAllowance: Allowance | null =
    houseQuota?.monthResetsAt && monthLimit !== null && monthRemaining !== null
      ? {
          limit: monthLimit,
          remaining: monthRemaining,
          resetsAt: houseQuota.monthResetsAt,
          period: 'month',
        }
      : null
  const quota =
    houseQuota && dayAllowance
      ? { ...houseQuota, ...bindingAllowance(dayAllowance, monthAllowance) }
      : null
  const [input, setInput] = useState(initialPrefill?.text ?? '')
  // Filters from a handed-over search, added to the question when it is sent.
  const [askFilters, setAskFilters] = useState<AskFilter[]>(
    initialPrefill?.filters ?? [],
  )
  // Held until the conversation it came with has opened, which clears the box.
  const prefillRef = useRef(initialConversationId ? initialPrefill : null)
  // Questions stopped in this visit, by question message id, with how long
  // they had run (null when the start time is unknown).
  const [stopped, setStopped] = useState<Record<string, number | null>>({})
  // A reopened conversation keeps its tweets as references; these are the
  // ones fetched so far, and why the others are not. Each batch that lands
  // rebuilds the answers' views with more of them (messageView.ts).
  const [supply, setSupply] = useState<TweetSupply>(EMPTY_SUPPLY)
  const loaderRef = useRef<TweetLoader | null>(null)
  const stopTweetLoader = () => {
    loaderRef.current?.stop()
    loaderRef.current = null
  }
  useEffect(() => stopTweetLoader, [])
  // The citation sidebar shows a citation of the conversation on screen:
  // opening another one, or leaving the page, closes it.
  useEffect(() => closeCitationSidebar, [conversation.id])
  const retryTweets = useCallback(() => loaderRef.current?.retry(), [])

  // The run id of the latest answer, so Stop can cancel the workflow instead
  // of only closing the stream, and a reopened conversation can reconnect to
  // an answer that is still being written. It stays once the answer ends;
  // a new question clears it (ask) until the server names the new run, so
  // Stop never cancels the run before.
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
        prepareReconnectToStreamRequest: ({ api }) => ({
          api: runIdRef.current
            ? `/api/agent-search/${encodeURIComponent(runIdRef.current)}/stream`
            : api,
        }),
        // Spaced reconnects, refusals asked again (reconnectingFetch.ts),
        // and more of them before the transport gives up.
        fetch: createReconnectingFetch(),
        maxConsecutiveErrors: STREAM_READ_ATTEMPTS,
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
  } = useChat({
    id: conversation.id,
    transport,
    // One render per chunk turns a burst (a fast answer, a reconnect's
    // replay) into dozens of synchronous renders; effects that set state on
    // every render (Radix's Popper anchors) then trip React's nested-update
    // limit, the chat records the error and stops reading mid-answer.
    throttle: 50,
  })

  // One request at a time: arrival fires both the mount and the status
  // effects (twice each under Strict Mode), and they share the request.
  const recentRequestRef = useRef<Promise<void> | null>(null)
  const loadRecent = useCallback(() => {
    recentRequestRef.current ??= fetchRecent().finally(() => {
      recentRequestRef.current = null
    })
    return recentRequestRef.current
    // fetchRecent only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const fetchRecent = async () => {
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
        monthlyLimit?: number
        remainingThisMonth?: number
        monthResetsAt?: string
        ownKeyMonthlyLimit?: number
        ownKeyRemainingThisMonth?: number
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
          monthLimit: numberOrNull(body.monthlyLimit),
          monthRemaining: numberOrNull(body.remainingThisMonth),
          monthResetsAt:
            typeof body.monthResetsAt === 'string' ? body.monthResetsAt : null,
          ownMonthLimit: numberOrNull(body.ownKeyMonthlyLimit),
          ownMonthRemaining: numberOrNull(body.ownKeyRemainingThisMonth),
        })
      }
    } catch {
      // The list is a convenience; the page works without it.
    } finally {
      setRecentLoaded(true)
    }
  }

  // Puts a stored conversation on screen: its messages at once, with their
  // tweets' places held, and the tweets in batches after, cited ones first.
  const installStored = (id: string, body: StoredConversation) => {
    stopTweetLoader()
    setSupply({
      tweets: new Map((body.tweets ?? []).map((tweet) => [tweet.id, tweet])),
      states: new Map(
        (body.unavailableTweetIds ?? []).map((tweetId) => [
          tweetId,
          'unavailable' as const,
        ]),
      ),
    })
    const pendingTweetIds = body.pendingTweetIds ?? []
    if (pendingTweetIds.length) {
      const loader = createTweetLoader({
        fetchBatch: (ids, signal) => fetchConversationTweets(id, ids, signal),
        onBatch: (tweets, states) =>
          setSupply((current) => mergeSupply(current, tweets, states)),
      })
      loaderRef.current = loader
      loader.load(pendingTweetIds)
    }
    setConversation({
      id,
      pending: body.messages,
      runningRunId: body.runningRunId,
    })
  }

  // One load at a time. Opening another conversation, or starting a new
  // one, leaves the load under way behind: its answer, arriving late, must
  // not replace what the member chose after it, nor move the address back.
  const loadRef = useRef<{ generation: number; controller: AbortController }>({
    generation: 0,
    controller: new AbortController(),
  })
  const leaveLoadBehind = () => {
    loadRef.current.controller.abort()
    loadRef.current = {
      generation: loadRef.current.generation + 1,
      controller: new AbortController(),
    }
    return loadRef.current
  }

  const openConversation = useCallback(async (id: string) => {
    const load = leaveLoadBehind()
    const current = () => loadRef.current === load
    shownConversationRef.current = id
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(
        `/api/agent-search/conversations/${encodeURIComponent(id)}`,
        { cache: 'no-store', signal: load.controller.signal },
      )
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as StoredConversation
      if (!current()) return
      installStored(id, body)
      // A draft from another conversation would be sent into this one; a
      // search handed over with this conversation becomes its follow-up.
      setInput(prefillRef.current?.text ?? '')
      setAskFilters(prefillRef.current?.filters ?? [])
      prefillRef.current = null
      showConversationInUrl(id)
    } catch {
      if (!current()) return
      setLoadError('That conversation could not be opened.')
      const fresh = newConversationId()
      shownConversationRef.current = fresh
      stopTweetLoader()
      setSupply(EMPTY_SUPPLY)
      setConversation({ id: fresh, pending: [], runningRunId: null })
      showConversationInUrl(null)
    } finally {
      if (current()) setLoading(false)
    }
    // installStored and the loader only set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A handed-over search lives in the box now; the address keeps only the
  // conversation, so a reload does not prefill again.
  useEffect(() => {
    if (!initialPrefill) return
    forgetPrefillInUrl()
    textareaRef.current?.focus()
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        dayAllowance
          ? {
              limit: dayAllowance.limit,
              resetLabel: resetLabel(dayAllowance),
              month: monthAllowance
                ? {
                    limit: monthAllowance.limit,
                    resetLabel: resetLabel(monthAllowance),
                  }
                : undefined,
            }
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

  // A stream can end or fail while its run goes on (a dropped connection, a
  // function time limit, a rebuild in development). When an answer's stream
  // ends, ask the server whether the run is still going before leaving the
  // answer as stopped, and read on if it is. A Stop closes the run first, so
  // a stopped answer is never resumed. The partial answer is replaced by the
  // replay, which starts from the beginning.
  const recoveriesRef = useRef(new Map<string, number>())
  // Runs the member stopped: their cancel may not have reached the server
  // when the stream closes, so they are never picked up again.
  const stoppedRunsRef = useRef(new Set<string>())
  const endedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== 'ready' && status !== 'error') return
    const last = messages[messages.length - 1]
    if (last?.role !== 'assistant' || endedIdRef.current === last.id) return
    endedIdRef.current = last.id
    const id = conversation.id
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(
          `/api/agent-search/conversations/${encodeURIComponent(id)}`,
          { cache: 'no-store' },
        )
        if (!response.ok || cancelled) return
        const body = (await response.json()) as { runningRunId?: string | null }
        const runId = body.runningRunId
        if (!runId || cancelled || stoppedRunsRef.current.has(runId)) return
        const tries = recoveriesRef.current.get(runId) ?? 0
        if (tries >= MAX_RECOVERIES) return
        recoveriesRef.current.set(runId, tries + 1)
        runIdRef.current = runId
        clearError()
        setMessages((current) =>
          current[current.length - 1]?.id === last.id
            ? current.slice(0, -1)
            : current,
        )
        void resumeStream()
      } catch {
        // The answer stays as it is; Ask again still works.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, messages, conversation.id, clearError, setMessages, resumeStream])

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
      stoppedRunsRef.current.add(runId)
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
    // The run before is over, however its stream ended; a Stop from here on
    // is for the new run, whose id the server has yet to return.
    runIdRef.current = null
    // Shown at once; the next refresh replaces it with the stored count.
    const less = (n: number | null) => (n === null ? null : Math.max(0, n - 1))
    setQuota((current) =>
      current
        ? {
            ...current,
            remaining: Math.max(0, current.remaining - 1),
            monthRemaining: less(current.monthRemaining),
            ownRemaining: less(current.ownRemaining),
            ownMonthRemaining: less(current.ownMonthRemaining),
          }
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
    leaveLoadBehind()
    setLoading(false)
    setLoadError(null)
    const fresh = newConversationId()
    shownConversationRef.current = fresh
    stopTweetLoader()
    setSupply(EMPTY_SUPPLY)
    setConversation({ id: fresh, pending: [], runningRunId: null })
    showConversationInUrl(null)
    textareaRef.current?.focus()
  }

  // Deleting history: the server keeps each run's accounting, so today's
  // questions still count. Deleting the open conversation starts a new one.
  const deleteHistory = async (url: string, clearsOpen: boolean) => {
    try {
      const response = await fetch(url, { method: 'DELETE' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        return body.error === 'run_in_progress'
          ? 'Stop the answer being written first.'
          : 'Could not delete. Try again.'
      }
    } catch {
      return 'Could not delete. Try again.'
    }
    if (clearsOpen) startNewConversation()
    await loadRecent()
    return null
  }
  const deleteConversation = (id: string) =>
    deleteHistory(
      `/api/agent-search/conversations/${encodeURIComponent(id)}`,
      id === conversation.id,
    )
  const deleteAllHistory = () =>
    deleteHistory('/api/agent-search/conversations', true)

  // The box sends what is typed plus any filters a handed-over search left.
  const sendDraft = () => {
    if (!input.trim() || busy || loading) return
    ask(questionWithFilters(input, askFilters))
    setAskFilters([])
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    sendDraft()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      sendDraft()
    }
  }

  const filterChips = askFilters.length > 0 && (
    <ul
      aria-label="Search filters added to your question"
      className="flex flex-wrap gap-1.5"
    >
      {askFilters.map((filter) => {
        const label = askFilterLabel(filter)
        return (
          <li
            key={filter.key}
            className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs text-foreground"
          >
            {label}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() =>
                setAskFilters((current) =>
                  current.filter((item) => item.key !== filter.key),
                )
              }
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </li>
        )
      })}
    </ul>
  )

  const hasThread = messages.length > 0
  const lastIndex = messages.length - 1
  // Each answer's view, by message index; a question needs its reply's.
  // Built only when the messages change, or more of a reopened
  // conversation's tweets arrive: typing in the box re-renders the page, and
  // rebuilding every answer per keystroke made typing lag. Finished answers
  // keep their view across a streamed update, so only the answer being
  // written is rebuilt and rendered per chunk.
  const buildViews = useMemo(createTurnViewBuilder, [])
  const views = useMemo(
    () =>
      buildViews(messages, {
        streaming: busy ? messages.length - 1 : null,
        supply,
      }),
    [buildViews, messages, busy, supply],
  )
  // Stable handlers for the answers, so a memoized turn skips re-rendering
  // while the member types; each calls the latest ask or stop.
  const askRef = useRef(ask)
  askRef.current = ask
  const stopRef = useRef(stopFromStatus)
  stopRef.current = stopFromStatus
  const stopTurn = useCallback(() => stopRef.current(), [])
  const askAgainHandlers = useRef(new Map<string, () => void>())
  const askAgainFor = (question: string) => {
    let handler = askAgainHandlers.current.get(question)
    if (!handler) {
      handler = () => askRef.current(question)
      askAgainHandlers.current.set(question, handler)
    }
    return handler
  }

  const quotaLow = quota !== null && quota.remaining <= 3
  const today: QuestionsToday | null = quota && {
    limit: quota.limit,
    remaining: quota.remaining,
    period: quota.period,
    resetLabel: resetLabel(quota),
    ownKey: onOwnKey,
    ownKeyEnabled: quota.ownKeyEnabled,
    ownLimit: quota.ownLimit,
    ownMonthLimit: quota.ownMonthLimit,
  }
  const limitSentence = quota
    ? quota.period === 'month'
      ? `You’ve used this month’s ${quota.limit} questions. You can ask again on ${resetLabel(quota)}.`
      : `You’ve used today’s ${quota.limit} questions. You can ask again at ${resetLabel(quota)}.`
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
        {filterChips && <div className="px-4 pt-3">{filterChips}</div>}
        {textarea(
          3,
          'Ask about members’ tweets',
          `block w-full px-4 pb-1 ${filterChips ? 'pt-2' : 'pt-3.5'}`,
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 pt-1 text-xs text-muted-foreground">
          <span className="ml-auto flex items-center gap-3">
            {today ? (
              <QuestionsLeft today={today} />
            ) : (
              !recentLoaded && (
                // Holds the count's place until the quota arrives.
                <Skeleton aria-hidden="true" className="h-4 w-20" />
              )
            )}
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
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          Private to you
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Quote aria-hidden="true" className="h-3.5 w-3.5" />
          Answers cite tweets
        </span>
        <span aria-hidden="true">·</span>
        <QuestionHandling />
      </p>
      {errorNote}
    </form>
  )

  // In a thread: one line, and the count only once few questions remain.
  const threadForm = (
    <form onSubmit={onSubmit} className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Ask a follow-up
      </label>
      {filterChips && <div className="mb-1.5">{filterChips}</div>}
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
  // Paused, the composer gives way to one plain line; conversations can
  // still be opened and deleted.
  const pausedNote = (
    <p className="text-sm leading-6 text-muted-foreground">
      Ask the archive is paused. New questions are off for now; your
      conversations are still here to read or delete.
    </p>
  )

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
          to ask up to{' '}
          {(today.period === 'month'
            ? today.ownMonthLimit
            : today.ownLimit
          )?.toLocaleString('en-US') ?? 'more'}{' '}
          a {today.period}.
        </p>
      )}
    </div>
  )

  const inThread = hasThread || loading
  // The citation sidebar sits beside the page, so the page makes room for it.
  const sidebarOpen = useCitationSidebar() !== null

  // Leaving would lose the answer being read: tweets and profiles open in
  // a new tab.
  return (
    <TweetLinksInNewTab>
      <main
        className={`min-h-screen bg-background transition-[padding] duration-300 motion-reduce:transition-none ${
          sidebarOpen ? SIDEBAR_ROOM : ''
        }`}
      >
        <section
          className={`mx-auto w-full px-4 py-8 sm:px-6 sm:py-12 ${
            inThread ? 'max-w-[51rem]' : 'max-w-2xl'
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
                  loading={!recentLoaded}
                  currentId={conversation.id}
                  onOpen={(id) => void openConversation(id)}
                  disabled={busy || loading}
                  onDelete={deleteConversation}
                  onDeleteAll={deleteAllHistory}
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
              {paused ? pausedNote : outOfQuestions ? limitNote : startForm}
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
                loading={!recentLoaded}
                onOpen={(id) => void openConversation(id)}
                onDelete={deleteConversation}
                onDeleteAll={deleteAllHistory}
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
                        startedAt={
                          active ? (runStartedAt ?? undefined) : undefined
                        }
                        onStop={stopTurn}
                        onAskAgain={
                          asked ? askAgainFor(messageText(asked)) : undefined
                        }
                        canAskAgain={canAskAgain}
                        showSources={
                          index === lastIndex ||
                          interrupted?.kind === 'stopped' ||
                          view.outcome === 'stopped'
                        }
                        onRetryTweets={retryTweets}
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
            <div className="sticky bottom-0 z-30 -mx-4 mt-10 max-w-[calc(48rem+2rem)] bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:max-w-[calc(48rem+3rem)] sm:px-6">
              {paused ? pausedNote : outOfQuestions ? limitNote : threadForm}
            </div>
          )}
        </section>
      </main>
    </TweetLinksInNewTab>
  )
}
