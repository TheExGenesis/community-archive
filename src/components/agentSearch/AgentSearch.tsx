'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@ai-sdk/workflow/client'
import type { UIMessage } from 'ai'
import { ArrowUp, MessageSquareText, Plus, Square } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { ConversationSummary } from '@/lib/agentSearch/history'
import { AgentSearchTurn } from './AgentSearchTurn'
import { RecentConversations } from './RecentConversations'
import { buildTurnView, describeChatError, messageText } from './messageView'

export const EXAMPLE_QUESTIONS = [
  'Who has complained or criticized the community archive?',
  'What do people here say about burnout and recovery?',
  'Which books get recommended most in members’ threads?',
  'How have people described the move from Twitter to Bluesky?',
]

const MAX_QUESTION_LENGTH = 1000

const newConversationId = () => crypto.randomUUID()

/** Points the address bar at a conversation (or none) without a navigation. */
function showConversationInUrl(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('c', id)
  else url.searchParams.delete('c')
  window.history.replaceState(window.history.state, '', url)
}

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
      }
      setRecent(body.conversations ?? [])
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

  // Refresh the list on arrival and whenever an answer finishes.
  useEffect(() => {
    if (status === 'ready') void loadRecent()
  }, [status, loadRecent])
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()
  const hintId = useId()

  const busy = status === 'submitted' || status === 'streaming'
  const errorMessage = describeChatError(error)

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

  const ask = (question: string) => {
    const text = question.trim().slice(0, MAX_QUESTION_LENGTH)
    if (!text || busy || loading) return
    if (error) clearError()
    setLoadError(null)
    setInput('')
    void sendMessage({ text })
  }

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
          placeholder={
            hasThread
              ? 'Ask a follow-up'
              : 'Ask about what people in the archive have said'
          }
          className="min-h-[3rem] flex-1 resize-y bg-transparent px-2 py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={stopRun}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square aria-hidden="true" className="h-3.5 w-3.5" />
            Stop
          </button>
        ) : (
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
        Enter to send, Shift+Enter for a new line. Answers are private to you.
      </p>
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
                Try a question
              </h2>
              <ul className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <li key={question}>
                    <button
                      type="button"
                      onClick={() => ask(question)}
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
                return (
                  <h2
                    key={message.id}
                    className="whitespace-pre-wrap break-words border-t border-border pt-6 text-xl font-semibold leading-snug text-foreground first:border-t-0 first:pt-0"
                  >
                    {messageText(message)}
                  </h2>
                )
              }
              if (message.role !== 'assistant') return null
              const active = busy && index === lastIndex
              return (
                <AgentSearchTurn
                  key={message.id}
                  view={buildTurnView(messages, index, { streaming: active })}
                  active={active}
                />
              )
            })}
            {status === 'submitted' && messages[lastIndex]?.role === 'user' && (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Starting the search
              </p>
            )}
          </div>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-destructive/40 px-3 py-2 text-sm text-foreground"
          >
            {errorMessage}
          </p>
        )}

        {hasThread && <div className="mt-10 max-w-3xl">{form}</div>}
      </section>
    </main>
  )
}
