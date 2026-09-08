import { fireEvent, render, screen } from '@testing-library/react'
import StrandMinimap from './StrandMinimap'
import { StrandFocusProvider, StrandCardFocus } from './StrandFocus'
jest.mock('@/components/portal/TweetRow', () => ({
  TweetAvatar: () => <span>Seed author avatar</span>,
}))
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
const strands = [
  {
    id: '1',
    title: 'Generated title',
    username: 'alice',
    text: 'The original seed tweet &amp; its text',
    mapLabel: 'Handwritten label',
    position: { x: 0, y: 0, cluster: 0, color: 'red' },
  },
  {
    id: '2',
    title: 'Another strand',
    username: 'bob',
    text: 'Another seed',
    mapLabel: 'Other label',
    position: { x: 10, y: 10, cluster: 1, color: 'blue' },
  },
]
function setup() {
  return render(
    <StrandFocusProvider>
      <StrandCardFocus id="1">
        <a href="/strands/1">Strand card</a>
      </StrandCardFocus>
      <StrandMinimap strands={strands} />
    </StrandFocusProvider>,
  )
}
beforeEach(() => mockPush.mockClear())
test('card hover grays out other nodes and labels, retaining the original ring and decoded seed text', () => {
  const { container } = setup()
  const circle = container.querySelector('[data-strand-id="1"]')!
  const other = container.querySelector('[data-strand-id="2"]')!
  const label = container.querySelector('[data-label-strand-id="2"]')!
  expect(circle).toHaveAttribute('stroke-width', '2')
  fireEvent.mouseEnter(screen.getByRole('article'))
  expect(circle).toHaveAttribute('data-highlighted', 'true')
  expect(circle).toHaveAttribute('fill', 'red')
  expect(other).toHaveAttribute('fill', 'hsl(var(--muted-foreground))')
  expect(label).toHaveAttribute('data-muted', 'true')
  expect(
    screen.getByText('The original seed tweet & its text'),
  ).toBeInTheDocument()
  fireEvent.mouseLeave(screen.getByRole('article'))
  expect(circle).not.toHaveAttribute('data-highlighted')
  expect(other).toHaveAttribute('fill', 'blue')
  expect(label).not.toHaveAttribute('data-muted')
})
test('cluster buttons highlight in place; card focus overrides and then restores the chosen cluster', () => {
  const { container } = setup()
  const first = container.querySelector('[data-strand-id="1"]')!
  const second = container.querySelector('[data-strand-id="2"]')!
  const cluster = screen.getByRole('button', {
    name: 'Cluster 2: Community and twitter tools',
  })
  fireEvent.click(cluster)
  expect(cluster).toHaveAttribute('aria-pressed', 'true')
  expect(mockPush).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Strand card' })).toBeInTheDocument()
  expect(container.querySelectorAll('[data-strand-id]')).toHaveLength(2)
  expect(first).toHaveAttribute('data-muted', 'true')
  expect(second).not.toHaveAttribute('data-muted')
  fireEvent.focus(screen.getByRole('link', { name: 'Strand card' }))
  expect(first).not.toHaveAttribute('data-muted')
  expect(second).toHaveAttribute('data-muted', 'true')
  fireEvent.blur(screen.getByRole('link', { name: 'Strand card' }))
  expect(first).toHaveAttribute('data-muted', 'true')
  expect(second).not.toHaveAttribute('data-muted')
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(first).not.toHaveAttribute('data-muted')
  expect(second).not.toHaveAttribute('data-muted')
})
test('keyboard focus on a dot also isolates it', () => {
  const { container } = setup()
  fireEvent.focus(
    screen.getByRole('link', { name: 'Explore Handwritten label' }),
  )
  expect(container.querySelector('[data-strand-id="1"]')).toHaveAttribute(
    'data-highlighted',
    'true',
  )
  expect(container.querySelector('[data-strand-id="2"]')).toHaveAttribute(
    'data-muted',
    'true',
  )
})
test('an unlabeled cluster reveals representatives and any focused dot gets its strand title above it', () => {
  const unlabelled = strands.map(({ mapLabel, ...strand }) => strand)
  const { container } = render(<StrandMinimap strands={unlabelled} />)
  expect(container.querySelectorAll('[data-label-strand-id]')).toHaveLength(0)
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Cluster 2: Community and twitter tools',
    }),
  )
  expect(
    container.querySelector('[data-label-strand-id="2"]'),
  ).toHaveTextContent('Another strand')
  fireEvent.focus(screen.getByRole('link', { name: 'Explore Generated title' }))
  const label = container.querySelector('[data-label-strand-id="1"]')!
  expect(label).toHaveTextContent('Generated title')
  expect(label).toHaveTextContent('Reply game and other visa classics')
  const box = label.querySelector('rect')!
  const dot = container.querySelector('[data-strand-id="1"]')!
  expect(
    Number(box.getAttribute('y')) + Number(box.getAttribute('height')),
  ).toBeLessThan(Number(dot.getAttribute('cy')))
})

test('detail view defaults to its seed, with avatar and seed identification', () => {
  const { container } = render(<StrandMinimap strands={strands} activeId="2" />)
  expect(container.querySelector('[data-strand-id="2"]')).toHaveAttribute(
    'data-highlighted',
    'true',
  )
  expect(container.querySelector('[data-strand-id="1"]')).toHaveAttribute(
    'data-muted',
    'true',
  )
  expect(screen.getByText('Strand seed post')).toBeInTheDocument()
  expect(screen.getByText('Seed author avatar')).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Open seed post ↗' }),
  ).toHaveAttribute('href', '/tweets/2')
})
