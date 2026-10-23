import { act, fireEvent, render, screen } from '@testing-library/react'
import useMapCamera from './useMapCamera'
import { transform } from '@/lib/hexMap/geometry'

const selected = jest.fn()
const bounds = { x: 0, y: 0, width: 100, height: 100 }
function MapSurface() {
  const camera = useMapCamera(bounds, 800, 600)
  return (
    <div data-testid="surface" ref={camera.ref} {...camera.handlers}>
      <output data-testid="position">
        {camera.camera.x},{camera.camera.y}
      </output>
      <button
        data-testid="selection"
        onClick={() => {
          if (!camera.moved.current) selected()
        }}
      >
        Select
      </button>
      <span data-testid="label">Community label</span>
      <output data-testid="zoom">{camera.camera.zoom}</output>
      <button onClick={() => camera.zoomAt(100)}>Maximum zoom</button>
      <button onClick={() => camera.focus(20, 30, 3)}>Focus community</button>
      <button
        onClick={() =>
          camera.fit([
            { x: 10, y: 20 },
            { x: 90, y: 80 },
          ])
        }
      >
        Fit usernames
      </button>
      <button onClick={() => camera.reset()}>Reset view</button>
    </div>
  )
}
function wheel(deltaY: number, modifiers: WheelEventInit = { ctrlKey: true }) {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
    ...modifiers,
  })
  fireEvent(screen.getByTestId('label'), event)
  act(() => jest.advanceTimersByTime(20))
  return event
}
beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it('keeps repeated zoom-out gestures from scrolling the page at minimum zoom', () => {
  render(<MapSurface />)
  for (let i = 0; i < 3; i++) expect(wheel(150).defaultPrevented).toBe(true)
  expect(screen.getByTestId('zoom')).toHaveTextContent('1')
})
it('keeps zoom-in gestures on the map at maximum zoom and still permits zooming back out', () => {
  render(<MapSurface />)
  fireEvent.click(screen.getByRole('button', { name: 'Maximum zoom' }))
  act(() => jest.advanceTimersByTime(20))
  expect(wheel(-150).defaultPrevented).toBe(true)
  expect(screen.getByTestId('zoom')).toHaveTextContent('8')
  expect(wheel(150).defaultPrevented).toBe(true)
  expect(Number(screen.getByTestId('zoom').textContent)).toBeLessThan(8)
})
it.each([{}, { shiftKey: true }])(
  'lets ordinary scrolling move the page (%j)',
  (modifiers) => {
    render(<MapSurface />)
    expect(wheel(-150, modifiers).defaultPrevented).toBe(false)
    expect(screen.getByTestId('zoom')).toHaveTextContent('1')
  },
)
it.each([{ ctrlKey: true }, { metaKey: true }])(
  'zooms with Ctrl or Cmd over labels (%j)',
  (modifiers) => {
    render(<MapSurface />)
    expect(wheel(-150, modifiers).defaultPrevented).toBe(true)
    expect(Number(screen.getByTestId('zoom').textContent)).toBeGreaterThan(1)
  },
)

function touch(type: string, points: [number, number][]) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: points.map(([clientX, clientY], identifier) => ({
      identifier,
      clientX,
      clientY,
    })),
  })
  fireEvent(screen.getByTestId('label'), event)
  act(() => jest.advanceTimersByTime(20))
  return event
}

it('leaves one-finger scrolling native and rejects the resulting click', () => {
  selected.mockClear()
  render(<MapSurface />)
  expect(touch('touchstart', [[200, 300]]).defaultPrevented).toBe(false)
  expect(touch('touchmove', [[200, 200]]).defaultPrevented).toBe(false)
  touch('touchend', [])
  fireEvent.click(screen.getByTestId('selection'))
  expect(selected).not.toHaveBeenCalled()
  expect(screen.getByTestId('position')).toHaveTextContent('0,0')
  // A fresh deliberate tap is still selectable.
  touch('touchstart', [[200, 200]])
  touch('touchend', [])
  fireEvent.click(screen.getByTestId('selection'))
  expect(selected).toHaveBeenCalledTimes(1)
})

it('pans with a constant two-finger distance, then zooms around their midpoint', () => {
  render(<MapSurface />)
  expect(
    touch('touchstart', [
      [300, 300],
      [500, 300],
    ]).defaultPrevented,
  ).toBe(true)
  expect(
    touch('touchmove', [
      [360, 330],
      [560, 330],
    ]).defaultPrevented,
  ).toBe(true)
  expect(screen.getByTestId('zoom')).toHaveTextContent('1')
  expect(screen.getByTestId('position')).toHaveTextContent('-10,-5')
  touch('touchmove', [
    [260, 330],
    [660, 330],
  ])
  expect(screen.getByTestId('zoom')).toHaveTextContent('2')
  expect(screen.getByTestId('position')).toHaveTextContent('-5,-2.5')
})

it('suppresses selection throughout a multi-touch gesture and recovers after cancellation', () => {
  selected.mockClear()
  render(<MapSurface />)
  touch('touchstart', [
    [200, 200],
    [400, 200],
  ])
  touch('touchend', [[200, 200]])
  touch('touchmove', [[240, 240]])
  touch('touchcancel', [])
  fireEvent.click(screen.getByTestId('selection'))
  expect(selected).not.toHaveBeenCalled()
  expect(screen.getByTestId('position')).toHaveTextContent('0,0')
  touch('touchstart', [[200, 200]])
  expect(touch('touchmove', [[200, 150]]).defaultPrevented).toBe(false)
})

it('does not take over a page scroll when a second finger arrives late', () => {
  render(<MapSurface />)
  touch('touchstart', [[200, 200]])
  touch('touchmove', [[200, 100]])
  expect(
    touch('touchstart', [
      [200, 100],
      [400, 100],
    ]).defaultPrevented,
  ).toBe(false)
  expect(
    touch('touchmove', [
      [220, 80],
      [420, 80],
    ]).defaultPrevented,
  ).toBe(false)
  expect(screen.getByTestId('position')).toHaveTextContent('0,0')
})

it('eases focus over 200ms and lets reset interrupt it', () => {
  render(<MapSurface />)
  fireEvent.click(screen.getByRole('button', { name: 'Focus community' }))
  act(() => jest.advanceTimersByTime(32))
  expect(Number(screen.getByTestId('zoom').textContent)).toBeGreaterThan(1)
  expect(Number(screen.getByTestId('zoom').textContent)).toBeLessThan(3)
  act(() => jest.advanceTimersByTime(200))
  expect(screen.getByTestId('position')).toHaveTextContent('-30,-20')
  expect(screen.getByTestId('zoom')).toHaveTextContent('3')
  fireEvent.click(screen.getByRole('button', { name: 'Focus community' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  act(() => jest.advanceTimersByTime(240))
  expect(screen.getByTestId('position')).toHaveTextContent('0,0')
  expect(screen.getByTestId('zoom')).toHaveTextContent('1')
})

it('lets a zoom gesture interrupt focus without later snapping back', () => {
  render(<MapSurface />)
  fireEvent.click(screen.getByRole('button', { name: 'Focus community' }))
  act(() => jest.advanceTimersByTime(32))
  wheel(-50)
  const zoom = screen.getByTestId('zoom').textContent
  act(() => jest.advanceTimersByTime(240))
  expect(screen.getByTestId('zoom').textContent).toBe(zoom)
})

it('skips focus animation when reduced motion is requested', () => {
  const previous = window.matchMedia
  window.matchMedia = jest.fn().mockReturnValue({ matches: true })
  try {
    render(<MapSurface />)
    fireEvent.click(screen.getByRole('button', { name: 'Focus community' }))
    expect(screen.getByTestId('position')).toHaveTextContent('-30,-20')
    expect(screen.getByTestId('zoom')).toHaveTextContent('3')
  } finally {
    window.matchMedia = previous
  }
})

it('fits separated username locations together even after zooming in', () => {
  render(<MapSurface />)
  fireEvent.click(screen.getByRole('button', { name: 'Maximum zoom' }))
  act(() => jest.advanceTimersByTime(20))
  fireEvent.click(screen.getByRole('button', { name: 'Fit usernames' }))
  act(() => jest.advanceTimersByTime(240))
  const [x, y] = screen
    .getByTestId('position')
    .textContent!.split(',')
    .map(Number)
  const zoom = Number(screen.getByTestId('zoom').textContent)
  const t = transform(bounds, 800, 600, { x, y, zoom })
  expect(zoom).toBeLessThan(8)
  for (const point of [
    { x: 10, y: 20 },
    { x: 90, y: 80 },
  ]) {
    expect(point.x * t.scale + t.x).toBeGreaterThanOrEqual(60)
    expect(point.x * t.scale + t.x).toBeLessThanOrEqual(740)
    expect(point.y * t.scale + t.y).toBeGreaterThanOrEqual(60)
    expect(point.y * t.scale + t.y).toBeLessThanOrEqual(540)
  }
})
