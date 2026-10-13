import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { RunStatus } from './RunStatus'

const searching = {
  id: 'c1',
  status: 'running' as const,
  text: 'Searching “community archive”',
}

test('shows each step as the progress, announced politely', () => {
  render(
    <RunStatus
      startedAt={Date.now()}
      found={0}
      writing={false}
      steps={[
        { id: 'c0', status: 'done', text: 'Looked up “patio11” · 1 member' },
        searching,
      ]}
      onStop={() => {}}
    />,
  )
  const progress = screen.getByLabelText('Search progress')
  expect(progress).toHaveAttribute('aria-live', 'polite')
  expect(progress).toHaveTextContent('Looked up “patio11” · 1 member')
  expect(progress).toHaveTextContent('Searching “community archive”')
  expect(screen.getByText(/Working/)).toBeInTheDocument()
})

test('shows the question being read before the first step', () => {
  render(
    <RunStatus
      startedAt={Date.now()}
      found={0}
      writing={false}
      onStop={() => {}}
    />,
  )
  expect(screen.getByLabelText('Search progress')).toHaveTextContent(
    'Reading the question',
  )
})

test('adds the answer as a step once the model writes', () => {
  render(
    <RunStatus
      startedAt={Date.now()}
      found={3}
      writing
      steps={[{ ...searching, status: 'done' }]}
      onStop={() => {}}
    />,
  )
  expect(screen.getByLabelText('Search progress')).toHaveTextContent(
    'Writing the answer',
  )
  expect(screen.getByText(/3 posts found/)).toBeInTheDocument()
})

test('says a slow run keeps its posts when stopped, and Stop stops it', () => {
  const onStop = jest.fn()
  render(
    <RunStatus
      startedAt={Date.now() - 120_000}
      found={12}
      writing={false}
      steps={[searching]}
      onStop={onStop}
    />,
  )
  expect(
    screen.getByText(
      'Taking longer than usual. If you stop now, the 12 posts found so far stay on the page.',
    ),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(onStop).toHaveBeenCalled()
})
