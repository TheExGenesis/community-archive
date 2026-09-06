import { render, screen } from '@testing-library/react'
import type { SocialGraphEdge, SocialGraphNode } from '@/lib/socialGraph'
import { SocialGraphDetails } from './SocialGraphDetails'

const alice: SocialGraphNode = {
  id: 'account:1',
  accountId: '1',
  username: 'alice',
  label: 'Alice',
  followers: 1_200,
  cluster: 'one',
  x: 0,
  y: 0,
  degree: 3,
  totalInteractions: 20,
}

const bob: SocialGraphNode = {
  ...alice,
  id: 'account:2',
  accountId: '2',
  username: 'bob',
  label: 'Bob',
}

const edge: SocialGraphEdge = {
  source: alice.id,
  target: bob.id,
  strength: 0.3,
  mutualInteractions: 4,
  yearlyInteractions: [[2024, 4, 9, 100, 100]],
}

const sharedProps = {
  communityMembers: [],
  communityInternalEdges: [],
  bridgeMembers: [],
  nodeById: new Map([
    [alice.id, alice],
    [bob.id, bob],
  ]),
  communityColorByNode: new Map([[bob.id, '#60a5fa']]),
  visibleTieCountByNode: new Map([
    [alice.id, 1],
    [bob.id, 1],
  ]),
  startYear: 2024,
  endYear: 2024,
  onFocusNode: jest.fn(),
  canGoBack: false,
  onBack: jest.fn(),
  onCloseNode: jest.fn(),
  onCloseCommunity: jest.fn(),
}

describe('SocialGraphDetails', () => {
  it('explains a selected reciprocal tie in both directions', () => {
    render(
      <SocialGraphDetails
        {...sharedProps}
        selectedNode={alice}
        selectedEdges={[edge]}
      />,
    )

    expect(screen.getByText('Reciprocal ties (1)')).toBeInTheDocument()
    expect(
      screen.getByText('4 sent · 9 received · at least 0.30% each'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Profile/ })).toHaveAttribute(
      'href',
      '/user/1',
    )
  })

  it('marks selected groups as algorithmic rather than self-identified', () => {
    render(
      <SocialGraphDetails
        {...sharedProps}
        selectedEdges={[]}
        selectedCommunity={{
          id: 'one',
          label: 'Around @alice, @bob',
          color: '#2acf80',
          nodeCount: 2,
        }}
        communityMembers={[alice, bob]}
        communityInternalEdges={[edge]}
      />,
    )

    expect(screen.getByText('Around @alice, @bob')).toBeInTheDocument()
    expect(
      screen.getByText(/not a self-chosen community name/),
    ).toBeInTheDocument()
  })
})
