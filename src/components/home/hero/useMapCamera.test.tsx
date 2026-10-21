import { act, fireEvent, render, screen } from '@testing-library/react'
import useMapCamera from './useMapCamera'

const bounds = { x: 0, y: 0, width: 100, height: 100 }
function MapSurface() {
  const camera = useMapCamera(bounds, 800, 600)
  return (
    <div data-testid="surface">
      <div ref={camera.ref} />
      <span data-testid="label">Community label</span>
      <output data-testid="zoom">{camera.camera.zoom}</output>
      <button onClick={() => camera.zoomAt(100)}>Maximum zoom</button>
    </div>
  )
}
function wheel(deltaY: number, shiftKey = false) {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
    shiftKey,
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
it('preserves explicit Shift-scroll as a way to scroll the page', () => {
  render(<MapSurface />)
  expect(wheel(150, true).defaultPrevented).toBe(false)
  expect(screen.getByTestId('zoom')).toHaveTextContent('1')
})
