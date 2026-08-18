import { act, render, screen } from '@testing-library/react'
import TweetCountTicker from './TweetCountTicker'

const VALUE = 15_425_771

function columns() {
  const strip = screen.getByText(VALUE.toLocaleString('en-US')).parentElement!
  return Array.from(strip.querySelectorAll<HTMLElement>('span[aria-hidden]'))
}

/** Read the strip back as the number the columns are currently showing. */
function displayed() {
  return columns()
    .map((column) => {
      const inner = column.firstElementChild as HTMLElement | null
      if (!inner) return column.textContent
      return String(offsetOf(inner) % 10)
    })
    .join('')
}

/** How many digit rows a column is translated up by. */
function offsetOf(inner: HTMLElement) {
  return (
    Number(/translateY\(-(\d+)px\)/.exec(inner.style.transform)?.[1] ?? 0) / 28
  )
}

function transitions() {
  return columns()
    .map(
      (column) =>
        (column.firstElementChild as HTMLElement | null)?.style.transition,
    )
    .filter(Boolean)
}

let frames: FrameRequestCallback[] = []
let matches = false

/** Run every frame callback queued so far, without draining ones they queue. */
function flushFrame() {
  const queued = frames
  frames = []
  act(() => {
    queued.forEach((frame) => frame(0))
  })
}

beforeEach(() => {
  frames = []
  matches = false
  jest.useFakeTimers()
  jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb) => frames.push(cb) as unknown as number)
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  window.matchMedia = jest.fn().mockImplementation(() => ({ matches })) as never
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('opens on zeros untransitioned, then spins up to the total', () => {
  render(<TweetCountTicker value={VALUE} />)

  expect(displayed()).toBe('00,000,000')
  expect(transitions().every((value) => value === 'none')).toBe(true)

  // The first frame only yields the paint. Settling here would collapse both
  // positions into one paint and the columns would never move.
  flushFrame()
  expect(displayed()).toBe('00,000,000')

  flushFrame()
  expect(displayed()).toBe('15,425,771')
  expect(transitions()[0]).toContain('620ms')
})

it('spins the columns different distances so the total stays unreadable', () => {
  render(<TweetCountTicker value={VALUE} />)
  flushFrame()
  flushFrame()

  const revolutions = columns()
    .map((column) => column.firstElementChild as HTMLElement | null)
    .filter((inner): inner is HTMLElement => inner !== null)
    .map((inner) => Math.floor(offsetOf(inner) / 10))

  // Every column travels at least two full revolutions, and they differ from
  // one another — mid-flight the strip is noise, not the total counting up.
  expect(Math.min(...revolutions)).toBeGreaterThanOrEqual(2)
  expect(new Set(revolutions).size).toBeGreaterThan(1)
})

it('lands the total even when the frame callback never runs', () => {
  render(<TweetCountTicker value={VALUE} />)
  expect(displayed()).toBe('00,000,000')

  // A hidden tab never fires requestAnimationFrame; the timer has to finish it.
  act(() => {
    jest.advanceTimersByTime(250)
  })

  expect(displayed()).toBe('15,425,771')
})

it('renders the total outright when motion is reduced', () => {
  matches = true
  render(<TweetCountTicker value={VALUE} />)

  expect(displayed()).toBe('15,425,771')
  act(() => {
    jest.advanceTimersByTime(1_000)
  })
  expect(displayed()).toBe('15,425,771')
})
