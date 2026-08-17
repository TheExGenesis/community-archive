'use client'

import { useEffect, useRef, useState } from 'react'

const DIGIT_HEIGHT = 28
const COUNT_UP_MS = 1500
/** The ramp stops just short of the total so the last digits visibly roll in. */
const RAMP_END = 0.985
const SETTLE_MS = 620
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

type Token = { key: number; digit: number | null }

/**
 * Split a count into odometer tokens using the *target* digit width, so the
 * strip keeps a fixed number of columns from the first frame and the sentence
 * around it never reflows.
 */
function tokenize(count: number, width: number): Token[] {
  const digits = String(Math.max(0, count)).padStart(width, '0').slice(-width)
  const tokens: Token[] = []
  for (let i = 0; i < width; i += 1) {
    if (i > 0 && (width - i) % 3 === 0) {
      tokens.push({ key: tokens.length, digit: null })
    }
    tokens.push({ key: tokens.length, digit: Number(digits[i]) })
  }
  return tokens
}

/**
 * Counts up to the archive total on mount, then rests there. The rolling
 * columns are decorative; assistive tech reads the plain total instead.
 */
export default function TweetCountTicker({ value }: { value: number }) {
  const formatted = value.toLocaleString('en-US')
  const width = String(Math.max(0, value)).length
  const [count, setCount] = useState(value)
  const [rolling, setRolling] = useState(false)
  const frame = useRef<number>()

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (reduced?.matches) return

    setRolling(true)
    setCount(0)
    const start = performance.now()
    const step = () => {
      const progress = Math.min(1, (performance.now() - start) / COUNT_UP_MS)
      const eased = 1 - Math.pow(1 - progress, 4)
      setCount(Math.floor(value * eased * RAMP_END))
      if (progress < 1) {
        frame.current = requestAnimationFrame(step)
        return
      }
      // Turn the transition on a frame before the true total lands, otherwise
      // the browser applies both in one recalc and the last hop snaps.
      setRolling(false)
      frame.current = requestAnimationFrame(() => setCount(value))
    }
    frame.current = requestAnimationFrame(step)

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [value])

  return (
    <span className="inline-flex items-start align-bottom tabular-nums">
      <span className="sr-only">{formatted}</span>
      {tokenize(count, width).map((token) =>
        token.digit === null ? (
          <span
            key={token.key}
            aria-hidden
            className="block h-[28px] leading-[28px]"
          >
            ,
          </span>
        ) : (
          <span
            key={token.key}
            aria-hidden
            className="block h-[28px] w-[1ch] overflow-hidden"
          >
            <span
              className="block"
              style={{
                transform: `translateY(-${token.digit * DIGIT_HEIGHT}px)`,
                transition: rolling
                  ? 'none'
                  : `transform ${SETTLE_MS}ms cubic-bezier(.16,.84,.24,1)`,
              }}
            >
              {DIGITS.map((digit) => (
                <span
                  key={digit}
                  className="block h-[28px] text-center leading-[28px]"
                >
                  {digit}
                </span>
              ))}
            </span>
          </span>
        ),
      )}
    </span>
  )
}
