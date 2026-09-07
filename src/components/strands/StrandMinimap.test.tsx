import { fireEvent, render, screen } from '@testing-library/react'
import StrandMinimap from './StrandMinimap'
import { StrandFocusProvider, StrandCardFocus } from './StrandFocus'
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
test('card hover and keyboard focus highlight its dot and preview original text; manual labels retain their ring', () => {
  const strands = [
    {
      id: '1',
      title: 'Generated title',
      username: 'alice',
      text: 'The original seed tweet &amp; its text',
      mapLabel: 'Handwritten label',
      position: { x: 0, y: 0, cluster: 0, color: 'red' },
    },
  ]
  const { container } = render(
    <StrandFocusProvider>
      <StrandCardFocus id="1">
        <a href="/strands/1">Strand card</a>
      </StrandCardFocus>
      <StrandMinimap strands={strands} />
    </StrandFocusProvider>,
  )
  const circle = container.querySelector('[data-strand-id="1"]')!
  expect(circle).toHaveAttribute('stroke-width', '2')
  fireEvent.mouseEnter(screen.getByRole('article'))
  expect(circle).toHaveAttribute('data-highlighted', 'true')
  expect(screen.getByText('The original seed tweet & its text')).toBeInTheDocument()
  fireEvent.mouseLeave(screen.getByRole('article'))
  expect(circle).not.toHaveAttribute('data-highlighted')
  fireEvent.focus(
    screen.getByRole('link', { name: 'Explore Handwritten label' }),
  )
  expect(circle).toHaveAttribute('data-highlighted', 'true')
  expect(
    screen.getByRole('link', { name: 'Cluster 1: Conversation & connection' }),
  ).toHaveAttribute('href', '/strands?cluster=0')
})
