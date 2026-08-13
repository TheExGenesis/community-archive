export type ProjectContributor = {
  name: string
  username: string
  role?: string
}

export const currentProjectContributors: ProjectContributor[] = [
  {
    name: 'Francisco Carvalho, or Xiq',
    username: 'exgenesis',
    role: 'Creator & Lead',
  },
  {
    name: 'Christine',
    username: 'christineist',
    role: 'Contributor',
  },
]

export const pastProjectContributors: ProjectContributor[] = [
  { name: '@IaimforGOAT', username: 'IaimforGOAT' },
  { name: 'Defender', username: 'DefenderOfBasic' },
  { name: 'Alexandre Variengien', username: 'A_Variengien' },
]

const projectContributorUsernames = new Set(
  [...currentProjectContributors, ...pastProjectContributors].map(
    ({ username }) => username.toLowerCase(),
  ),
)

export function isProjectContributor(username: string) {
  return projectContributorUsernames.has(
    username.replace(/^@/, '').toLowerCase(),
  )
}
