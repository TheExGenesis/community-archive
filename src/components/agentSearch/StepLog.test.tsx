import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { LogLine, StepLog } from './StepLog'
import type { ProgressLine, TimelineEntry } from './messageView'

const done = (n: number): ProgressLine => ({
  id: `s${n}`,
  status: 'done',
  text: `Searched “term ${n}” · ${n} tweets`,
})

test('a running log shows its steps, a timer and Stop', () => {
  const onStop = jest.fn()
  render(
    <StepLog
      mode="running"
      steps={[done(1), { id: 'r', status: 'running', text: 'Reading thread' }]}
      startedAt={Date.now() - 25_000}
      onStop={onStop}
    />,
  )
  expect(screen.getByText(/Searching/)).toHaveTextContent('Searching · 0:25')
  const progress = screen.getByLabelText('Search progress')
  expect(progress).toHaveAttribute('aria-live', 'polite')
  expect(progress).toHaveTextContent('Reading thread')
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(onStop).toHaveBeenCalled()
})

test('a running log with no steps yet is reading the question', () => {
  render(
    <StepLog
      mode="running"
      steps={[]}
      startedAt={Date.now()}
      onStop={jest.fn()}
    />,
  )
  expect(screen.getByLabelText('Search progress')).toHaveTextContent(
    'Reading the question',
  )
})

test('a slow run says it is still searching', () => {
  render(
    <StepLog
      mode="running"
      steps={[done(1)]}
      startedAt={Date.now() - 120_000}
      onStop={jest.fn()}
    />,
  )
  expect(
    screen.getByText(
      'Most questions finish within a minute. This one is still searching.',
    ),
  ).toBeInTheDocument()
})

test('a stopped log keeps its latest six steps and folds the earlier ones', () => {
  const steps = Array.from({ length: 20 }, (_, i) => done(i + 1))
  render(
    <StepLog
      mode="stopped"
      steps={steps}
      elapsedMs={105_000}
      onAskAgain={jest.fn()}
    />,
  )
  expect(screen.getByText('You stopped this at 1:45')).toBeInTheDocument()
  expect(screen.getByText('· 20 steps')).toBeInTheDocument()
  expect(screen.queryByText('Searched “term 14” · 14 tweets')).toBeNull()
  expect(screen.getByText('Searched “term 15” · 15 tweets')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '14 earlier steps' }))
  expect(screen.getByText('Searched “term 1” · 1 tweets')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Hide earlier steps' }),
  ).toBeInTheDocument()
})

test('a stop before any search, and an unknown stop time, read plainly', () => {
  const { rerender } = render(
    <StepLog mode="stopped" steps={[]} elapsedMs={3_000} />,
  )
  expect(
    screen.getByText('You stopped this before it searched'),
  ).toBeInTheDocument()
  rerender(<StepLog mode="stopped" steps={[done(1)]} elapsedMs={null} />)
  expect(screen.getByText('You stopped this')).toBeInTheDocument()
})

test('a step cut short by the stop is not shown as still running', () => {
  render(
    <StepLog
      mode="stopped"
      steps={[{ id: 'r', status: 'running', text: 'Searching “x”' }]}
      elapsedMs={null}
    />,
  )
  expect(document.querySelector('.animate-spin')).toBeNull()
})

test('a failed log says why, and Ask again explains when it cannot run', () => {
  const { rerender } = render(
    <StepLog
      mode="failed"
      steps={[
        {
          id: 'e',
          status: 'error',
          text: 'Could not search “x” · tried twice',
        },
      ]}
      elapsedMs={null}
      unavailable
      onAskAgain={jest.fn()}
      canAskAgain={false}
    />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Archive search isn’t responding',
  )
  const again = screen.getByRole('button', { name: 'Ask again' })
  expect(again).toBeDisabled()
  expect(again).toHaveAccessibleDescription('No questions left today')
  rerender(<StepLog mode="failed" steps={[]} elapsedMs={null} />)
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The answer stopped before it finished',
  )
  expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull()
})

test('the folded line opens in place to the steps, a cap note and what was not searched', () => {
  render(
    <LogLine
      summary="2 steps · 3 cited"
      steps={[done(1), done(2)]}
      cappedAt={300}
    />,
  )
  const line = screen.getByRole('button', { name: '2 steps · 3 cited' })
  expect(screen.queryByText(/term 1/)).toBeNull()
  fireEvent.click(line)
  expect(line).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/term 2/)).toBeInTheDocument()
  expect(screen.getByText(/300-tweet limit/)).toBeInTheDocument()
  expect(screen.getByText(/Not searched: live X/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
})

const thinking = (id: string, text: string, latest = false): TimelineEntry => ({
  kind: 'thinking',
  id,
  text,
  latest,
})
const step = (line: ProgressLine): TimelineEntry => ({ kind: 'step', line })

test('reasoning being written shows in full; earlier reasoning is folded', () => {
  const timeline = [
    thinking('t1', 'Start with the word itself. Then widen.'),
    step(done(1)),
    thinking(
      't2',
      'One reply looks relevant. Read the thread around it.',
      true,
    ),
  ]
  const { rerender } = render(
    <StepLog
      mode="running"
      steps={[done(1)]}
      timeline={timeline}
      startedAt={Date.now() - 5_000}
      onStop={jest.fn()}
    />,
  )
  const progress = screen.getByLabelText('Search progress')
  // The latest reasoning is open, whole.
  expect(progress).toHaveTextContent(
    'One reply looks relevant. Read the thread around it.',
  )
  // Earlier reasoning folds to its first sentence and opens on request.
  expect(progress).toHaveTextContent('Thinking · Start with the word itself.')
  expect(progress).not.toHaveTextContent('Then widen.')
  const [first] = screen.getAllByRole('button', { name: /Thinking/ })
  fireEvent.click(first)
  expect(progress).toHaveTextContent('Then widen.')

  // The next step starts: the latest reasoning folds by itself, and what
  // the reader opened stays open.
  rerender(
    <StepLog
      mode="running"
      steps={[done(1), done(2)]}
      timeline={[
        ...timeline.slice(0, 2),
        thinking('t2', 'One reply looks relevant. Read the thread around it.'),
        step(done(2)),
      ]}
      startedAt={Date.now() - 5_000}
      onStop={jest.fn()}
    />,
  )
  expect(progress).toHaveTextContent('Thinking · One reply looks relevant.')
  expect(progress).not.toHaveTextContent('Read the thread around it.')
  expect(progress).toHaveTextContent('Then widen.')
})

test('the running log folds to the entry under way and its newest sentence', () => {
  render(
    <StepLog
      mode="running"
      steps={[done(1)]}
      timeline={[
        step(done(1)),
        thinking('t1', 'That search was too narrow. Try the plural.', true),
      ]}
      startedAt={Date.now()}
      onStop={jest.fn()}
    />,
  )
  const header = screen.getByRole('button', { name: /Searching/ })
  expect(header).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(header)
  expect(header).toHaveAttribute('aria-expanded', 'false')
  const progress = screen.getByLabelText('Search progress')
  expect(progress).not.toHaveTextContent('Searched “term 1”')
  expect(progress).toHaveTextContent('Thinking · Try the plural.')
  // Stop stays while folded.
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
})

test('a stopped log shows its reasoning folded', () => {
  render(
    <StepLog
      mode="stopped"
      steps={[done(1)]}
      timeline={[
        step(done(1)),
        thinking('t1', 'Try the plural. Then people.', true),
      ]}
      elapsedMs={4_000}
    />,
  )
  expect(screen.getByRole('button', { name: /Thinking/ })).toHaveTextContent(
    'Thinking · Try the plural.',
  )
  expect(screen.queryByText(/Then people/)).toBeNull()
})

test('a search step can be opened in archive search, in a new tab', () => {
  render(
    <StepLog
      mode="stopped"
      steps={[
        { ...done(1), searchHref: '/search?q=term+1' },
        { id: 's2', status: 'done', text: 'Checked 300 tweets · 40 relevant' },
      ]}
      elapsedMs={null}
    />,
  )
  // In the DOM for keyboard users even while hidden until hover or focus.
  const links = screen.getAllByRole('link', {
    name: 'Open this search in archive search',
  })
  expect(links).toHaveLength(1)
  expect(links[0]).toHaveAttribute('href', '/search?q=term+1')
  expect(links[0]).toHaveAttribute('target', '_blank')
  expect(links[0].getAttribute('rel')).toContain('noopener')
})
