/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SocialGraphSnapshot } from '@/lib/socialGraph'
import SocialGraphExplorer from './SocialGraphExplorer'

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

jest.mock('sigma', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    kill: jest.fn(),
    setSetting: jest.fn(),
    refresh: jest.fn(),
    getCamera: jest.fn(() => ({ animatedReset: jest.fn() })),
  })),
}))

const workerInstances: MockWorker[] = []

class MockWorker {
  addEventListener = jest.fn()
  postMessage = jest.fn()
  terminate = jest.fn()

  constructor() {
    workerInstances.push(this)
  }
}

const originalWorker = globalThis.Worker

const snapshot = {
  version: 2,
  generatedAt: '2026-08-14T23:15:21.000Z',
  semantics: {
    interactions: ['reply', 'quote'],
    directedStrength: 'directed',
    mutualStrength: 'mutual',
    mutualInteractions: 'minimum',
    clusterPolicy: 'stable',
    timeWindow: 'yearly',
  },
  temporal: { minYear: 2006, maxYear: 2026 },
  stats: {
    nodeCount: 3,
    edgeCount: 1,
    totalMutualEdgeCount: 1,
    clusterCount: 1,
    maxFollowers: 100_000,
    maxStrength: 3,
    suggestedMinStrength: 0,
    edgePayloadTruncated: false,
  },
  clusters: [
    { id: 'stable', label: 'Stable community', color: '#2acf80', nodeCount: 3 },
  ],
  nodes: [
    {
      id: 'a',
      accountId: 'a',
      username: 'alpha',
      label: 'Alpha',
      followers: 1_000,
      cluster: 'stable',
      x: 0,
      y: 0,
      degree: 1,
      totalInteractions: 3,
    },
    {
      id: 'b',
      accountId: 'b',
      username: 'beta',
      label: 'Beta',
      followers: 600,
      cluster: 'stable',
      x: 1,
      y: 1,
      degree: 1,
      totalInteractions: 3,
    },
    {
      id: 'c',
      accountId: 'c',
      username: 'gamma',
      label: 'Gamma',
      followers: 100,
      cluster: 'stable',
      x: 2,
      y: 2,
      degree: 0,
      totalInteractions: 0,
    },
  ],
  edges: [
    {
      source: 'a',
      target: 'b',
      strength: 3,
      mutualInteractions: 3,
      yearlyInteractions: [[2021, 3, 3, 100, 100]],
    },
  ],
} as SocialGraphSnapshot

describe('SocialGraphExplorer defaults', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: MockWorker,
    })
  })

  beforeEach(() => {
    workerInstances.length = 0
  })

  afterAll(() => {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: originalWorker,
    })
  })

  it('loads the curated filters and automatically adapts the visible graph', async () => {
    render(
      <SocialGraphExplorer
        snapshot={snapshot}
        currentMember={{ accountId: 'a', username: 'alpha' }}
      />,
    )

    expect(screen.getByText('517')).toBeInTheDocument()
    expect(screen.getByText('0.30% each')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find yourself' })).toBeEnabled()
    expect(screen.getByText('Around @alpha, @beta')).toBeInTheDocument()
    expect(
      screen.getByRole('slider', { name: 'Interaction start year' }),
    ).toHaveAttribute('aria-valuenow', '2021')
    expect(
      screen.getByRole('slider', { name: 'Interaction end year' }),
    ).toHaveAttribute('aria-valuenow', '2026')

    await waitFor(() => {
      expect(workerInstances).toHaveLength(1)
      expect(workerInstances[0].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: [
            expect.objectContaining({ id: 'a' }),
            expect.objectContaining({ id: 'b' }),
          ],
          edges: [expect.objectContaining({ source: 'a', target: 'b' })],
          options: {
            clustering: 'louvain',
            layout: 'clustered-force',
          },
        }),
      )
    })
  })

  it.each(['core', 'balanced', 'broad'])(
    'recalculates groups and layout after applying the %s preset',
    async (preset) => {
      render(
        <SocialGraphExplorer
          snapshot={snapshot}
          currentMember={{ accountId: 'a', username: 'alpha' }}
        />,
      )

      await waitFor(() => {
        expect(workerInstances[0].postMessage).toHaveBeenCalledTimes(1)
      })

      fireEvent.click(screen.getByRole('button', { name: preset }))

      await waitFor(() => {
        expect(workerInstances[0].terminate).toHaveBeenCalledTimes(1)
        expect(workerInstances.at(-1)?.postMessage).toHaveBeenCalledTimes(1)
      })
    },
  )

  it('debounces rapid filter changes, ignores obsolete worker replies, and cancels on unmount', () => {
    jest.useFakeTimers()
    try {
      const { unmount } = render(<SocialGraphExplorer snapshot={snapshot} />)
      act(() => jest.advanceTimersByTime(0))
      const original = workerInstances[0]
      const oldRequest = original.postMessage.mock.calls[0][0]
      fireEvent.keyDown(
        screen.getByRole('slider', { name: 'Interaction start year' }),
        { key: 'ArrowRight' },
      )
      const superseded = workerInstances.at(-1)!
      fireEvent.keyDown(
        screen.getByRole('slider', { name: 'Interaction start year' }),
        { key: 'ArrowLeft' },
      )
      const latest = workerInstances.at(-1)!
      expect(original.terminate).toHaveBeenCalledTimes(1)
      expect(superseded.terminate).toHaveBeenCalledTimes(1)
      act(() => jest.advanceTimersByTime(349))
      expect(latest.postMessage).not.toHaveBeenCalled()
      const oldMessage = original.addEventListener.mock.calls.find(
        ([event]) => event === 'message',
      )![1]
      act(() =>
        oldMessage({ data: { id: oldRequest.id, error: 'obsolete error' } }),
      )
      expect(screen.queryByText('obsolete error')).not.toBeInTheDocument()
      act(() => jest.advanceTimersByTime(1))
      expect(latest.postMessage).toHaveBeenCalledTimes(1)
      expect(superseded.postMessage).not.toHaveBeenCalled()
      fireEvent.keyDown(
        screen.getByRole('slider', { name: 'Interaction start year' }),
        { key: 'ArrowRight' },
      )
      const pending = workerInstances.at(-1)!
      unmount()
      act(() => jest.advanceTimersByTime(350))
      expect(pending.terminate).toHaveBeenCalledTimes(1)
      expect(pending.postMessage).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })
})
