import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
  // The step under way leads; the count and the clock sit beside Stop.
  const progress = screen.getByLabelText('Search progress')
  expect(progress).toHaveAttribute('aria-live', 'polite')
  expect(progress).toHaveTextContent('Reading thread')
  expect(progress).not.toHaveTextContent('0:25')
  expect(screen.getByText('0:25').parentElement).toHaveTextContent(
    '2 steps · 0:25',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(onStop).toHaveBeenCalled()
})

test('Stop waits for the server to confirm, and says when the cancel was refused', () => {
  const onStop = jest.fn()
  const { rerender } = render(
    <StepLog
      mode="running"
      steps={[]}
      startedAt={Date.now()}
      onStop={onStop}
      stopState="pending"
    />,
  )
  expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled()
  rerender(
    <StepLog
      mode="running"
      steps={[]}
      startedAt={Date.now()}
      onStop={onStop}
      stopState="failed"
    />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t stop. Try again.',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(onStop).toHaveBeenCalled()
  // The folded line while the answer is written carries the same Stop.
  rerender(
    <LogLine
      summary="2 steps · writing the answer"
      steps={[done(1)]}
      onStop={onStop}
      stopState="pending"
    />,
  )
  expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled()
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

test('a slow run says it is taking longer than most, beside its clock', () => {
  render(
    <StepLog
      mode="running"
      steps={[done(1)]}
      startedAt={Date.now() - 120_000}
      onStop={jest.fn()}
    />,
  )
  expect(screen.getByText('2:00').parentElement).toHaveTextContent(
    '1 step · 2:00 · longer than most',
  )
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

test('reasoning starts folded by default and opens on click in chronological order', () => {
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
  // The live header shows the newest sentence; inside the chronological log,
  // both earlier and active reasoning start folded to a single quiet line.
  const header = within(screen.getByLabelText('Search progress')).getByRole(
    'button',
  )
  expect(screen.getByLabelText('Search progress')).toHaveTextContent(
    'Thinking · Read the thread around it.',
  )
  const progress = document.getElementById(
    header.getAttribute('aria-controls') ?? '',
  ) as HTMLElement
  expect(progress).toHaveTextContent('Thinking · Start with the word itself.')
  expect(progress).not.toHaveTextContent('Then widen.')
  expect(progress).toHaveTextContent('Thinking · Read the thread around it.')
  expect(progress).not.toHaveTextContent('One reply looks relevant.')

  // Opening an earlier thought expands it in place and keeps it open as later steps arrive.
  const [first, second] = within(progress).getAllByRole('button', {
    name: /Thinking/,
  })
  fireEvent.click(first)
  expect(progress).toHaveTextContent('Then widen.')
  fireEvent.click(second)
  expect(progress).toHaveTextContent(
    'One reply looks relevant. Read the thread around it.',
  )

  // The next step starts: what the reader opened stays open, and the new step
  // appends chronologically at the end.
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
  const log = document.getElementById(
    screen
      .getByLabelText('Search progress')
      .querySelector('button')
      ?.getAttribute('aria-controls') ?? '',
  ) as HTMLElement
  expect(log).toHaveTextContent('Then widen.')
  expect(log).toHaveTextContent('Searched “term 2” · 2 tweets')
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
  const header = within(screen.getByLabelText('Search progress')).getByRole(
    'button',
  )
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

test('parallel compound searches fold into a clean summary and expand into a sub-list; consecutive result reads collapse', () => {
  render(
    <StepLog
      mode="stopped"
      steps={[
        {
          id: 'p1',
          status: 'done',
          kind: 'search',
          text: 'Searched “architecture” from @alice · 10 tweets · Searched “architecture” from @bob · 5 tweets',
          searchHref: '/search?q=architecture&fromUser=alice',
          searchHrefs: {
            'architecture|alice': '/search?q=architecture&fromUser=alice',
            'architecture|bob': '/search?q=architecture&fromUser=bob',
          },
        },
        {
          id: 'p2',
          status: 'done',
          kind: 'search',
          text: 'Searched “tssui” · 7 tweets · Searched “roark” · 20 tweets',
        },
        {
          id: 'r1',
          status: 'done',
          kind: 'files',
          text: 'Looked through the results',
        },
        {
          id: 'r2',
          status: 'done',
          kind: 'files',
          text: 'Looked through the results',
        },
        {
          id: 'r3',
          status: 'done',
          kind: 'files',
          text: 'Looked through the results',
        },
      ]}
      elapsedMs={null}
    />,
  )
  // Same-query multi-account batch summarizes cleanly and expands on click.
  // No ambiguous "Open in search" link sits on the collapsed parent row.
  const across = screen.getByRole('button', {
    name: 'Searched “architecture” across 2 accounts · 15 tweets',
  })
  expect(across).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText(/from @alice/)).toBeNull()
  expect(
    screen.queryByRole('link', { name: 'Open this search in archive search' }),
  ).toBeNull()
  fireEvent.click(across)
  expect(across).toHaveAttribute('aria-expanded', 'true')
  expect(
    screen.getByText('Searched “architecture” from @alice'),
  ).toBeInTheDocument()
  expect(screen.getByText('10 tweets')).toBeInTheDocument()
  // Each expanded sub-search gets its own exact archive search link.
  const subLinks = screen.getAllByRole('link', {
    name: 'Open this search in archive search',
  })
  expect(subLinks.map((a) => a.getAttribute('href'))).toEqual([
    '/search?q=architecture&fromUser=alice',
    '/search?q=architecture&fromUser=bob',
  ])

  // Mixed parallel searches summarize as a count.
  expect(
    screen.getByRole('button', { name: 'Ran 2 searches · 27 tweets' }),
  ).toBeInTheDocument()

  // Consecutive "Looked through the results" steps collapse to one row with 3×.
  expect(screen.getAllByText('Looked through the results')).toHaveLength(1)
  expect(screen.getByText('· 3×')).toBeInTheDocument()
})

test('a partially failed batch stays expandable and notes the unfinished part; a totally failed batch expands its attempted commands', () => {
  render(
    <StepLog
      mode="stopped"
      steps={[
        {
          id: 'partial1',
          status: 'done',
          kind: 'search',
          partial: true,
          text: 'Searched “a” · 10 tweets · Searched “b” · 5 tweets',
        },
        {
          id: 'err1',
          status: 'error',
          kind: 'search',
          text: 'Could not finish: searching “x”, and 1 more at once',
          attempted: ['Searching “x”', 'Searching “y”'],
        },
      ]}
      elapsedMs={null}
    />,
  )
  const partialBtn = screen.getByRole('button', {
    name: /Ran 2 searches · 15 tweets · partial/,
  })
  fireEvent.click(partialBtn)
  expect(
    screen.getByText('Another part of this batch did not finish'),
  ).toBeInTheDocument()

  const errBtn = screen.getByRole('button', {
    name: /Could not finish: searching “x”/,
  })
  fireEvent.click(errBtn)
  expect(screen.getByText('Searching “x”')).toBeInTheDocument()
  expect(screen.getByText('Searching “y”')).toBeInTheDocument()
})

test('while the answer is written, the last reasoning reads as finished: only the pill is under way', () => {
  const timeline = [
    step(done(1)),
    thinking('t1', 'First thought here. Second thought here.', true),
  ]
  const { rerender } = render(
    <StepLog
      mode="running"
      steps={[done(1)]}
      timeline={timeline}
      startedAt={Date.now()}
      onStop={jest.fn()}
    />,
  )
  // Searching: the reasoning being written shows its newest sentence.
  expect(
    screen.getByRole('button', { name: 'Thinking · Second thought here.' }),
  ).toBeInTheDocument()
  // Writing: the same reasoning is over, so it folds to its first sentence
  // as it will once the answer is done.
  rerender(
    <LogLine
      summary="1 step · writing the answer"
      steps={[done(1)]}
      timeline={timeline}
      onStop={jest.fn()}
    />,
  )
  fireEvent.click(
    screen.getByRole('button', { name: '1 step · writing the answer' }),
  )
  expect(
    screen.getByRole('button', { name: 'Thinking · First thought here.' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Thinking · Second thought here.' }),
  ).toBeNull()
})

test('the log line keeps the clock while the answer is written, then says what the run took', () => {
  const { rerender } = render(
    <LogLine
      summary="2 steps · writing the answer"
      steps={[done(1), done(2)]}
      startedAt={Date.now() - 65_000}
      onStop={jest.fn()}
    />,
  )
  expect(screen.getByText('1:05')).toBeInTheDocument()
  rerender(
    <LogLine
      summary="2 steps · 3 cited"
      steps={[done(1), done(2)]}
      durationMs={266_000}
    />,
  )
  // After the pills, not inside the summary between steps and result.
  expect(screen.getByText('4m 26s')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: '2 steps · 3 cited' }),
  ).not.toHaveTextContent('4m 26s')
  // Under a minute it is seconds alone.
  rerender(
    <LogLine
      summary="2 steps · 3 cited"
      steps={[done(1), done(2)]}
      durationMs={26_400}
    />,
  )
  expect(screen.getByText('26s')).toBeInTheDocument()
  // A run whose time is unknown shows none.
  rerender(<LogLine summary="2 steps · 3 cited" steps={[done(1), done(2)]} />)
  expect(screen.queryByText(/^\d+m? ?\d*s$/)).toBeNull()
})
