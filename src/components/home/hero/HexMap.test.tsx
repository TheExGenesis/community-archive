import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import HexMap from './HexMap'
import type { HexSnapshot } from '@/lib/hexMap/types'

jest.mock('@/components/PagePerformance', () => ({ SectionReady: () => null }))
const snapshot: HexSnapshot = {
  version: 'test',
  week: '2026-07-27',
  radius: 0.3,
  caveats: [],
  regions: [
    {
      id: 0,
      name: 'Test region',
      short: 'Test',
      note: '',
      x: 0,
      y: 0,
      color: '#86a878',
      terms: [],
    },
  ],
  cells: [
    {
      x: 0,
      y: 0,
      accounts: 10,
      archived: 1,
      region: 0,
      terms: ['open source'],
      activity: 1,
    },
    {
      x: 1,
      y: 1,
      accounts: 20,
      archived: 0,
      region: 0,
      terms: ['history'],
      activity: 0.5,
    },
  ],
}
const mount = () =>
  render(
    <HexMap
      stories={<p>Digest stories</p>}
      actions={<button>Opt in</button>}
    />,
  )

beforeEach(() => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => snapshot })
})

it('loads aggregate coverage, selects cells, supports multi-select and clears with Escape', async () => {
  mount()
  const cell = await screen.findByRole('button', {
    name: 'Test, cell 0: 1 of 10 accounts archived',
  })
  expect(screen.getByText('30')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Opt in' })).toBeInTheDocument()
  fireEvent.click(cell)
  expect(cell).toHaveAttribute('aria-pressed', 'true')
  expect(cell).toHaveAttribute('fill-opacity', '0.9')
  expect(
    screen.getByRole('button', {
      name: 'Test, cell 1: 0 of 20 accounts archived',
    }),
  ).toHaveAttribute('fill-opacity', '0.2')
  expect(screen.getByRole('link', { name: 'open source' })).toHaveAttribute(
    'href',
    '/search?q=open%20source',
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Test, cell 1: 0 of 20 accounts archived',
    }),
    { shiftKey: true },
  )
  expect(screen.getByText('2 selected cells')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Opt in' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(cell).toHaveAttribute('fill-opacity', '0.9')
  const emptyCell = screen.getByRole('button', {
    name: 'Test, cell 1: 0 of 20 accounts archived',
  })
  expect(emptyCell).toHaveAttribute('fill-opacity', '0.2')
  expect(emptyCell).toHaveAttribute('stroke-opacity', '0.12')
})

it('selects a country with the keyboard', async () => {
  mount()
  const country = await screen.findByRole('button', {
    name: 'Select Test region',
  })
  fireEvent.keyDown(country, { key: 'Enter' })
  expect(screen.getByText('2 selected cells')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear map selection' }))
  expect(screen.getByRole('button', { name: 'Opt in' })).toBeInTheDocument()
})

it('keeps stories and actions usable if the map fails and allows retry', async () => {
  ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'))
  mount()
  expect(
    await screen.findByText(
      'The map couldn’t load. You can still search the archive.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByText('Digest stories')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Opt in' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() =>
    expect(screen.getByLabelText(/Community hex map/)).toBeInTheDocument(),
  )
})

it('keeps uploader cells bright by default and uses a smaller increase for additional uploaders', async () => {
  const denser = {
    ...snapshot,
    cells: [...snapshot.cells, { ...snapshot.cells[0], archived: 5, x: 2 }],
  }
  ;(fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => denser,
  })
  mount()
  const one = await screen.findByRole('button', {
    name: 'Test, cell 0: 1 of 10 accounts archived',
  })
  const zero = screen.getByRole('button', {
    name: 'Test, cell 1: 0 of 20 accounts archived',
  })
  const five = screen.getByRole('button', {
    name: 'Test, cell 2: 5 of 10 accounts archived',
  })
  const opacity = (cell: HTMLElement) =>
    Number(cell.getAttribute('fill-opacity'))
  expect(opacity(one)).toBeGreaterThan(opacity(zero) + 0.6)
  expect(opacity(five)).toBeGreaterThan(opacity(one))
  expect(opacity(five) - opacity(one)).toBeLessThan(0.1)
  fireEvent.click(zero)
  expect(opacity(one)).toBe(0.9)
  const channels = (cell: HTMLElement) =>
    cell
      .getAttribute('fill')!
      .match(/[\d.]+/g)!
      .map(Number)
  const [oneHue, oneSaturation, oneLightness] = channels(one)
  const [fiveHue, fiveSaturation, fiveLightness] = channels(five)
  expect(oneSaturation).toBe(50)
  expect(fiveHue).toBe(oneHue)
  expect(fiveSaturation).toBeGreaterThan(oneSaturation)
  expect(fiveLightness).toBe(oneLightness)
})

it('zooms at the pointer without scrolling the page, and reset restores the viewport', async () => {
  mount()
  const svg = await screen.findByLabelText(/Community hex map/)
  const viewport = svg.parentElement!
  jest
    .spyOn(viewport, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)
  const initial = svg.getAttribute('viewBox')!
  const before = initial.split(' ').map(Number)
  const wheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -150,
    clientX: 600,
    clientY: 300,
  })
  fireEvent(viewport, wheel)
  expect(wheel.defaultPrevented).toBe(true)
  const after = svg.getAttribute('viewBox')!.split(' ').map(Number)
  expect(after[2]).toBeLessThan(before[2])
  const worldAtPointer = (box: number[]) =>
    box[0] + box[2] / 2 + 200 * Math.max(box[2] / 800, box[3] / 600)
  expect(worldAtPointer(after)).toBeCloseTo(worldAtPointer(before))
  fireEvent.click(screen.getByRole('button', { name: 'Reset map zoom' }))
  expect(svg).toHaveAttribute('viewBox', initial)
})

it('pans on a drag without selecting the cell, and preserves a subsequent click', async () => {
  const original = window.PointerEvent
  window.PointerEvent = MouseEvent as typeof PointerEvent
  try {
    mount()
    const svg = await screen.findByLabelText(/Community hex map/)
    const viewport = svg.parentElement!
    const cell = screen.getByRole('button', {
      name: 'Test, cell 0: 1 of 10 accounts archived',
    })
    jest
      .spyOn(viewport, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)
    viewport.setPointerCapture = jest.fn()
    viewport.hasPointerCapture = jest.fn(() => true)
    viewport.releasePointerCapture = jest.fn()
    const initial = svg.getAttribute('viewBox')!
    fireEvent.pointerDown(cell, { button: 0, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(viewport, { clientX: 250, clientY: 230 })
    fireEvent.pointerUp(viewport)
    fireEvent.click(cell)
    expect(svg.getAttribute('viewBox')).not.toBe(initial)
    expect(viewport.setPointerCapture).toHaveBeenCalled()
    expect(viewport.releasePointerCapture).toHaveBeenCalled()
    expect(cell).toHaveAttribute('aria-pressed', 'false')
    fireEvent.pointerDown(cell, { button: 0, clientX: 200, clientY: 200 })
    fireEvent.pointerUp(cell)
    fireEvent.click(cell)
    expect(cell).toHaveAttribute('aria-pressed', 'true')
  } finally {
    window.PointerEvent = original
  }
})
