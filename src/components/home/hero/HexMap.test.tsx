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
  fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
  expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(cell).toHaveAttribute('fill-opacity', '0.65')
  const emptyCell = screen.getByRole('button', {
    name: 'Test, cell 1: 0 of 20 accounts archived',
  })
  expect(emptyCell).toHaveAttribute('fill-opacity', '0.015')
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
