'use client'

import { useEffect, useRef, useState } from 'react'

const DIGIT_HEIGHT = 28
const ROLL_MS = 620
const SETTLE_FALLBACK_MS = 250
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

type Token = { key: number; digit: number | null; spins: number }

/**
 * Split the total into odometer tokens. Columns are derived from the *target*
 * number, so the strip keeps a fixed width and the sentence around it never
 * reflows. Each column also carries its own count of full revolutions: spun
 * different distances, the digits read as noise until they land.
 */
function tokenize(value: number): Token[] {
  const digits = String(Math.max(0, value))
  const tokens: Token[] = []
  for (let i = 0; i < digits.length; i += 1) {
    const fromRight = digits.length - i - 1
    if (i > 0 && (fromRight + 1) % 3 === 0) {
      tokens.push({ key: tokens.length, digit: null, spins: 0 })
    }
    tokens.push({
      key: tokens.length,
      digit: Number(digits[i]),
      spins: 2 + (fromRight % 3),
    })
  }
  return tokens
}

/**
 * Spins up from zero to the archive total once on mount, then rests there. The
 * rolling columns are decorative; assistive tech reads the plain total instead.
 */
export default function TweetCountTicker({ value }: { value: number }) {
  const formatted = value.toLocaleString('en-US')
  const [spinning, setSpinning] = useState(false)
  const frame = useRef<number>()
  const fallback = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (reduced?.matches) return

    // Drop to all zeros untransitioned, then transition away from them.
    setSpinning(true)
    const settle = () => setSpinning(false)
    // Two frames deep: a callback registered here runs *before* the next frame
    // paints, so settling in it collapses both positions into one paint and
    // nothing moves. The nested frame waits for the zeros to land.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(settle)
    })
    // A hidden tab never runs the frame callback, which would strand the strip
    // on zero. Nobody is watching the spin there, so land the total.
    fallback.current = setTimeout(settle, SETTLE_FALLBACK_MS)

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      clearTimeout(fallback.current)
    }
  }, [value])

  return (
    <span className="inline-flex items-start align-bottom tabular-nums">
      <span className="sr-only">{formatted}</span>
      {tokenize(value).map((token) =>
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
                transform: `translateY(-${
                  spinning ? 0 : (token.spins * 10 + token.digit) * DIGIT_HEIGHT
                }px)`,
                transition: spinning
                  ? 'none'
                  : `transform ${ROLL_MS}ms cubic-bezier(.16,.84,.24,1)`,
              }}
            >
              {Array.from({ length: token.spins * 10 + 10 }, (_, index) => (
                <span
                  key={index}
                  className="block h-[28px] text-center leading-[28px]"
                >
                  {DIGITS[index % 10]}
                </span>
              ))}
            </span>
          </span>
        ),
      )}
    </span>
  )
}
