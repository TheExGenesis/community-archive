export type ProjectContributor = {
  name: string
  // Archive username; the About page links to their profile.
  username?: string
  // External page, for contributors without an archive profile.
  url?: string
  role?: string
  qualifier?: string
}

export const currentProjectContributors: ProjectContributor[] = [
  {
    name: 'Francisco Carvalho',
    username: 'exgenesis',
    role: 'Founder',
    qualifier: 'Xiq',
  },
  {
    name: 'Christine Shiba',
    username: 'christineist',
    role: 'Contributor',
  },
]

export const pastProjectContributors: ProjectContributor[] = [
  { name: '@IaimforGOAT', username: 'IaimforGOAT' },
  { name: '@DefenderOfBasic', username: 'DefenderOfBasic' },
  { name: 'Alexandre Variengien', username: 'A_Variengien' },
  { name: 'Brandon Duderstadt', url: 'https://nomad.garden' },
]

const projectContributorUsernames = new Set([
  ...[...currentProjectContributors, ...pastProjectContributors].flatMap(
    ({ username }) => (username ? [username.toLowerCase()] : []),
  ),
  // Badge recognition does not require an About-page contributor listing.
  'maskys_',
])

export function isProjectContributor(username: string) {
  return projectContributorUsernames.has(
    username.replace(/^@/, '').toLowerCase(),
  )
}
