import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import HexMap from './HexMap'
import type { HexSnapshot } from '@/lib/hexMap/types'
import { captureHomepageMapAction } from '@/lib/posthog'

jest.mock('./hero.module.css', () => ({}))
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))
jest.mock('@/lib/posthog', () => ({ captureHomepageMapAction: jest.fn() }))

const snapshot: HexSnapshot = {
  version: 'test',
  week: '2026-10-26',
  radius: 6,
  caveats: [],
  cells: [9, 20, 6].map((region, i) => ({
    x: i * 30,
    y: 0,
    region,
    accounts: 10,
    archived: 2,
    activity: 0,
    terms: [],
  })),
  regions: [9, 20, 6].map((id, i) => ({
    id,
    x: i * 30,
    y: 0,
    name: `Community ${id}`,
    short: `Community ${id}`,
    note: '',
    color: '#888888',
    terms: [],
  })),
}
const noop = () => {}
const originalResizeObserver = window.ResizeObserver
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
function Map() {
  const [selected, onSelect] = useState<number[]>([])
  return (
    <HexMap
      snapshot={snapshot}
      selected={selected}
      onSelect={onSelect}
      onSelectionIntent={noop}
      storyCells={[]}
      pins={[]}
      anchor=""
      heatTerm=""
      onRetryHeat={noop}
      onClearHeat={noop}
      scrubber={null}
      coverageLive
    />
  )
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      new Proxy(
        {
          measureText: (text: string) => ({ width: text.length * 5 }),
        },
        { get: (target, key) => target[key as keyof typeof target] ?? noop },
      ) as unknown as CanvasRenderingContext2D,
  )
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  window.ResizeObserver = jest
    .fn()
    .mockImplementation(() => ({ observe: noop, disconnect: noop }))
})
afterEach(() => {
  jest.restoreAllMocks()
  window.ResizeObserver = originalResizeObserver
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts)
  else Reflect.deleteProperty(document, 'fonts')
})

it('tracks selections and explicit controls, while render and hover stay silent', async () => {
  render(<Map />)
  await act(async () => {})
  const surface = screen.getByRole('group', { name: /^Community map/ })
  expect(captureHomepageMapAction).not.toHaveBeenCalled()
  fireEvent.keyDown(surface, { key: 'ArrowRight' })
  expect(captureHomepageMapAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Community 20' }))
  fireEvent.keyDown(surface, { key: 'Enter', shiftKey: true })
  fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  fireEvent.keyDown(surface, { key: '-' })
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  fireEvent.keyDown(surface, { key: 'Escape' })
  expect(jest.mocked(captureHomepageMapAction).mock.calls).toEqual([
    ['community_selected'],
    ['hex_selected'],
    ['archive_overlay_toggled', { enabled: true }],
    ['zoom_in_clicked'],
    ['zoom_out_clicked'],
    ['view_reset'],
    ['selection_cleared'],
  ])
  fireEvent.keyDown(surface, { key: 'Escape' })
  expect(captureHomepageMapAction).toHaveBeenCalledTimes(7)
})

it('does not count a touch scroll as a selection', async () => {
  render(<Map />)
  await act(async () => {})
  const surface = screen.getByRole('group', { name: /^Community map/ })
  for (const [type, y] of [
    ['touchstart', 300],
    ['touchmove', 200],
    ['touchend', null],
  ] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'touches', {
      value: y === null ? [] : [{ clientX: 200, clientY: y }],
    })
    fireEvent(surface, event)
  }
  fireEvent.click(surface, { clientX: 200, clientY: 200 })
  expect(captureHomepageMapAction).not.toHaveBeenCalled()
})
