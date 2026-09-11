export type ProjectContributor = {
  name: string
  username: string
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
]

const projectContributorUsernames = new Set([
  ...[...currentProjectContributors, ...pastProjectContributors].map(
    ({ username }) => username.toLowerCase(),
  ),
  // Badge recognition does not require an About-page contributor listing.
  'maskys_',
])

export function isProjectContributor(username: string) {
  return projectContributorUsernames.has(
    username.replace(/^@/, '').toLowerCase(),
  )
}
