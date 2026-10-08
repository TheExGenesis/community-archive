'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@ai-sdk/workflow/client'
import type { UIMessage } from 'ai'
import { ArrowUp, MessageSquareText, Square } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { AgentSearchTurn } from './AgentSearchTurn'
import { buildTurnView, describeChatError, messageText } from './messageView'

export const EXAMPLE_QUESTIONS = [
  'Who has complained or criticized the community archive?',
  'What do people here say about burnout and recovery?',
  'Which books get recommended most in members’ threads?',
  'How have people described the move from Twitter to Bluesky?',
]

const MAX_QUESTION_LENGTH = 1000

export default function AgentSearch() {
  // The run id of the answer in progress, so Stop can cancel the workflow
  // instead of only closing the stream.
  const runIdRef = useRef<string | null>(null)
  const transport = useMemo(
    () =>
      new WorkflowChatTransport<UIMessage>({
        api: '/api/agent-search',
        onChatSendMessage: (response) => {
          runIdRef.current = response.headers.get('x-workflow-run-id')
        },
        onChatEnd: () => {
          runIdRef.current = null
        },
      }),
    [],
  )
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    clearError,
    stop,
  } = useChat({ transport })
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
    if (!text || busy) return
    if (error) clearError()
    setInput('')
    void sendMessage({ text })
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
          <h1
            className={`font-bold tracking-tight text-foreground ${
              hasThread ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'
            }`}
          >
            Ask the archive
          </h1>
          {!hasThread && (
            <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
              An agent searches members’ tweets, follows threads and quotes, and
              writes a short answer. Every claim links to the tweet it came
              from.
            </p>
          )}
        </div>

        {!hasThread && (
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
