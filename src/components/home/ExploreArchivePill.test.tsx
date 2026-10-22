import { act, render, screen } from '@testing-library/react'
import ExploreArchivePill from './ExploreArchivePill'

let onResize: () => void
let mapTop = 0
const disconnect = jest.fn()
const originalResizeObserver = window.ResizeObserver

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 768,
  })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const pillHeight = document.querySelector('a[href="#community-map"]')
        ? 58
        : 0
      return {
        top:
          this.id === 'community-map'
            ? mapTop + pillHeight - window.scrollY
            : 0,
        height:
          this.tagName === 'DIV' && this.parentElement?.tagName === 'SECTION'
            ? pillHeight
            : 0,
      } as DOMRect
    })
  window.ResizeObserver = jest.fn().mockImplementation((callback) => {
    onResize = callback
    return { observe: jest.fn(), disconnect }
  })
})

afterEach(() => {
  jest.restoreAllMocks()
  window.ResizeObserver = originalResizeObserver
})

function renderHero() {
  return render(
    <>
      <section>
        <ExploreArchivePill />
      </section>
      <section id="community-map" />
    </>,
  )
}

test('hides the pill when the map is already above the fold', () => {
  mapTop = 600
  renderHero()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test('shows the pill below the fold without oscillating after layout or scrolling', () => {
  mapTop = 800
  const { unmount } = renderHero()
  expect(screen.getByRole('link')).toHaveAttribute('href', '#community-map')
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })
  act(() => onResize())
  expect(screen.getByRole('link')).toBeInTheDocument()
  unmount()
  expect(disconnect).toHaveBeenCalled()
})

test('updates when the viewport or streamed hero content changes size', () => {
  mapTop = 800
  renderHero()
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 900,
  })
  act(() => window.dispatchEvent(new Event('resize')))
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  mapTop = 950
  act(() => onResize())
  expect(screen.getByRole('link')).toBeInTheDocument()
})
