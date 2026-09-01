import {
  COMMUNITY_PROJECTS,
  filterCommunityProjects,
} from './communityProjects'

describe('community project catalog', () => {
  it('contains only verified entries with source posts and no prototype filler', () => {
    expect(COMMUNITY_PROJECTS).toHaveLength(11)
    expect(COMMUNITY_PROJECTS).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Ratio Radar' }),
        expect.objectContaining({ name: 'Bangers' }),
      ]),
    )

    for (const project of COMMUNITY_PROJECTS) {
      if (project.slug === 'conversation-map') {
        expect(project.projectUrl).toBe('/conversation-map')
        expect(project.sourceTweetId).toBeUndefined()
      } else expect(project.sourceTweetId).toMatch(/^\d+$/)
      expect(project.projectUrl ?? '').not.toContain('example.com')
      expect(project.image ?? '').not.toContain('pbs.twimg.com')
    }
  })

  it('searches across project, creator, category, and tag copy', () => {
    expect(
      filterCommunityProjects(COMMUNITY_PROJECTS, 'audio', 'All', 'Featured'),
    ).toEqual([expect.objectContaining({ name: 'Community Archive Radio' })])
    expect(
      filterCommunityProjects(COMMUNITY_PROJECTS, 'Loopy', 'Games', 'Featured'),
    ).toEqual([expect.objectContaining({ name: 'Followle' })])
  })

  it('filters by category and applies factual sort options', () => {
    const games = filterCommunityProjects(
      COMMUNITY_PROJECTS,
      '',
      'Games',
      'Featured',
    )
    expect(games.map((project) => project.name)).toEqual(['Followle'])

    const newest = filterCommunityProjects(
      COMMUNITY_PROJECTS,
      '',
      'All',
      'Newest',
    )
    expect(newest[0].name).toBe('Conversation Map')

    const alphabetical = filterCommunityProjects(
      COMMUNITY_PROJECTS,
      '',
      'All',
      'A–Z',
    )
    expect(alphabetical.map((project) => project.name)).toEqual(
      [...alphabetical]
        .map((project) => project.name)
        .sort((left, right) => left.localeCompare(right)),
    )
  })

  it('keeps the featured Tools order curated for the Gallery', () => {
    const tools = filterCommunityProjects(
      COMMUNITY_PROJECTS,
      '',
      'Tools',
      'Featured',
    )

    expect(tools.map((project) => project.name)).toEqual([
      'Bangers.page',
      'Tweet Harvest',
      'Semantic Search',
      "Malcolm Ocean's Links",
      'Distill',
      'Tweetscope',
    ])
  })
})
