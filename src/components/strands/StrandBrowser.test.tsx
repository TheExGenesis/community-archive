import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrandBrowser } from './StrandBrowser'
import type { StrandPageData } from '@/lib/community-apps/types'
jest.mock('./StrandCard', () => ({
  StrandCard: ({ strand }: { strand: { title: string } }) => (
    <article>{strand.title}</article>
  ),
}))
jest.mock('./StrandMinimap', () => ({
  __esModule: true,
  default: () => <aside data-testid="minimap">Map</aside>,
}))
let intersect: () => void
const item = (id: string) => ({ id, title: `Strand ${id}`, summary: '' })
const initialPage: StrandPageData = {
  items: [item('1')],
  total: 2,
  nextOffset: 24,
}
beforeEach(() => {
  global.IntersectionObserver = jest.fn().mockImplementation((callback) => {
    intersect = () => callback([{ isIntersecting: true }])
    return { observe: jest.fn(), disconnect: jest.fn() }
  })
  global.fetch = jest.fn()
})
afterEach(() => jest.restoreAllMocks())
test('scroll appends a bounded page without replacing existing cards or the minimap', async () => {
  ;(fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [item('1'), item('2')],
      total: 2,
      nextOffset: null,
    }),
  })
  render(
    <StrandBrowser strands={[]} initialQuery="" initialPage={initialPage} />,
  )
  const first = screen.getByText('Strand 1')
  const map = screen.getByTestId('minimap')
  act(() => {
    intersect()
    intersect()
  })
  await screen.findByText('Strand 2')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect((fetch as jest.Mock).mock.calls[0][0]).toContain('offset=24')
  expect(screen.getByText('Strand 1')).toBe(first)
  expect(screen.getByTestId('minimap')).toBe(map)
  expect(screen.getAllByRole('article')).toHaveLength(2)
})
test('search runs in place, aborts stale results, and only loads the first matching batch', async () => {
  let resolveOld: (value: unknown) => void = () => {}
  ;(fetch as jest.Mock).mockImplementation((url: string) =>
    url.includes('q=old')
      ? new Promise((resolve) => {
          resolveOld = resolve
        })
      : Promise.resolve({
          ok: true,
          json: async () => ({
            items: [item('new')],
            total: 30,
            nextOffset: 24,
          }),
        }),
  )
  render(
    <StrandBrowser strands={[]} initialQuery="" initialPage={initialPage} />,
  )
  const map = screen.getByTestId('minimap')
  const url = window.location.href
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old' } })
  fireEvent.submit(screen.getByRole('searchbox').closest('form')!)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const signal = (fetch as jest.Mock).mock.calls[0][1].signal
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new' } })
  fireEvent.submit(screen.getByRole('searchbox').closest('form')!)
  await screen.findByText('Strand new')
  await act(async () =>
    resolveOld({
      ok: true,
      json: async () => ({ items: [item('old')], total: 1, nextOffset: null }),
    }),
  )
  expect(signal.aborted).toBe(true)
  expect(screen.queryByText('Strand old')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('minimap')).toBe(map)
  expect(window.location.href).toBe(url)
})
test('failed page loads retain existing cards and offer retry without an automatic retry loop', async () => {
  ;(fetch as jest.Mock)
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [item('2')], total: 2, nextOffset: null }),
    })
  render(
    <StrandBrowser strands={[]} initialQuery="" initialPage={initialPage} />,
  )
  act(() => intersect())
  await screen.findByRole('alert')
  expect(screen.getByText('Strand 1')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText('Strand 2')
})
