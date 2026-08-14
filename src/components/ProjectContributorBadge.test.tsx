import { render, screen } from '@testing-library/react'
import { ProjectContributorBadge } from './ProjectContributorBadge'

describe('ProjectContributorBadge', () => {
  it.each([
    'exgenesis',
    'christineist',
    'DefenderOfBasic',
    'A_Variengien',
    'IaimforGOAT',
  ])('identifies %s as a project contributor', (username) => {
    render(<ProjectContributorBadge username={username} />)

    expect(screen.getByText('Archive contributor')).toBeInTheDocument()
  })

  it('matches contributor usernames case-insensitively', () => {
    render(<ProjectContributorBadge username="@CHRISTINEIST" />)

    expect(screen.getByText('Archive contributor')).toBeInTheDocument()
  })

  it('does not badge other archive members', () => {
    render(<ProjectContributorBadge username="archive_member" />)

    expect(screen.queryByText('Archive contributor')).not.toBeInTheDocument()
  })
})
