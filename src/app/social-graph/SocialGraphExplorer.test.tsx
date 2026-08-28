/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
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
})
