import {
  COMMUNITY_PROJECTS,
  filterCommunityProjects,
  homepageFeaturedProjects,
  HOMEPAGE_PICKS,
  mergeCommunityCatalog,
  type CommunityProject,
} from './communityProjects'

describe('community project catalog', () => {
  it('contains only verified entries and no prototype filler', () => {
    expect(COMMUNITY_PROJECTS).toHaveLength(17)
    expect(COMMUNITY_PROJECTS).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Ratio Radar' }),
      ]),
    )

    for (const project of COMMUNITY_PROJECTS) {
      if (project.slug === 'birdseye') {
        expect(project.projectUrl).toBe('/birdseye')
        expect(project.sourceTweetId).toBeUndefined()
      } else if (project.slug === 'pairwise') {
        expect(project.projectUrl).toBe('https://strangestloop.io/pairwise')
        expect(project.sourceUrl).toBe('https://strangestloop.io/coding/')
      } else if (project.slug === 'tpot-trust') {
        expect(project.projectUrl).toBe('https://tpot.uptrusthq.com/')
        expect(project.creator).toBe('UpTrust HQ')
        expect(project.sourceTweetId).toBeUndefined()
      } else if (project.slug === 'threadapalooza') {
        expect(project.projectUrl).toBe('https://threadapalooza.maskys.com/')
        expect(project.sourceTweetId).toBeUndefined()
      } else expect(project.sourceTweetId).toMatch(/^\d+$/)
      expect(project.projectUrl ?? '').not.toContain('example.com')
      expect(project.image ?? '').not.toContain('pbs.twimg.com')
    }
  })

  it('lets admin-edited rows override the curated catalog', () => {
    const edited = mergeCommunityCatalog([
      {
        ...COMMUNITY_PROJECTS[0],
        featured: false,
        name: 'Pairwise (edited)',
        summary: 'Derived from the description.',
      },
      {
        ...COMMUNITY_PROJECTS.find((project) => project.slug === 'followle')!,
        featured: true,
      },
    ])
    expect(edited).toHaveLength(COMMUNITY_PROJECTS.length)
    // A backfilled row keeps the curated headline until an admin writes one.
    expect(edited[0].summary).toBe(COMMUNITY_PROJECTS[0].summary)
    expect(
      mergeCommunityCatalog([
        {
          ...COMMUNITY_PROJECTS[0],
          summary: 'A new headline.',
          summaryEdited: true,
        },
      ])[0].summary,
    ).toBe('A new headline.')
    expect(edited[0].name).toBe('Pairwise (edited)')
    expect(edited[0].featured).toBe(false)
    expect(
      filterCommunityProjects(edited, '', 'Games', 'Featured')[0].featured,
    ).toBe(true)
  })

  it('shows the picked home page apps in order', () => {
    const cuties: CommunityProject = {
      ...COMMUNITY_PROJECTS[0],
      slug: 'cuties-b9b5e204',
      name: 'Cuties',
      projectUrl: 'https://cuties.example.org/',
      featured: true,
    }
    const twesties: CommunityProject = {
      ...COMMUNITY_PROJECTS[0],
      slug: 'twesties-8a710e65',
      name: 'Twesties',
      projectUrl: 'https://twesties.example.org/',
      featured: true,
    }
    const catalog = mergeCommunityCatalog([
      ...COMMUNITY_PROJECTS.map((project) => ({ ...project, featured: true })),
      cuties,
      twesties,
    ])
    expect(
      homepageFeaturedProjects(catalog).map((project) => project.slug),
    ).toEqual([...HOMEPAGE_PICKS])
  })

  it('fills slots a pick leaves empty with featured projects', () => {
    // Before the published rows load, the database-only Cuties is missing.
    expect(
      homepageFeaturedProjects(mergeCommunityCatalog([])).map(
        (project) => project.slug,
      ),
    ).toEqual([
      'model-behavior-reports',
      'meet-your-neighbors',
      'followle',
      'common-tongue',
      'distill',
      'pairwise',
    ])
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
    expect(newest[0].name).toBe('Threadapalooza')

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

  it('sorts by like count, breaking ties with the newest project', () => {
    const catalog = COMMUNITY_PROJECTS.map((project) => ({
      ...project,
      likeCount:
        project.slug === 'bangers-page'
          ? 10
          : project.slug === 'followle'
            ? 0
            : 1,
    }))

    const mostLiked = filterCommunityProjects(catalog, '', 'All', 'Most liked')
    expect(mostLiked[0].name).toBe('Bangers.page')
    expect(mostLiked.at(-1)?.name).toBe('Followle')

    // With no like counts at all, Most liked degrades to the Newest order.
    const untouched = filterCommunityProjects(
      COMMUNITY_PROJECTS,
      '',
      'All',
      'Most liked',
    )
    const newest = filterCommunityProjects(
      COMMUNITY_PROJECTS,
      '',
      'All',
      'Newest',
    )
    expect(untouched.map((project) => project.name)).toEqual(
      newest.map((project) => project.name),
    )
  })

  it('hides first-party tools even when a published row carries their slug', () => {
    const catalog = mergeCommunityCatalog([
      { ...COMMUNITY_PROJECTS[0], slug: 'bangers', name: 'Bangers' },
      { ...COMMUNITY_PROJECTS[0], slug: 'conversation-map', name: 'Map' },
    ])
    expect(catalog.map((project) => project.slug)).not.toEqual(
      expect.arrayContaining(['bangers', 'strands', 'conversation-map']),
    )
    expect(catalog).toHaveLength(COMMUNITY_PROJECTS.length)
  })

  it('keeps the featured Tools order curated for the Gallery', () => {
    const tools = filterCommunityProjects(
      COMMUNITY_PROJECTS,
      '',
      'Tools',
      'Featured',
    )

    expect(tools.map((project) => project.name)).toEqual([
      'Pairwise',
      'Birdseye',
      'Bangers.page',
      'Tweet Harvest',
      'Meet Your Neighbors',
      'Semantic Search',
      "Malcolm Ocean's Links",
      'Distill',
      'Tweetscope',
      'Common Tongue',
    ])
  })
})

describe('communityMenu', () => {
  it('previews the picked apps in order and counts the whole gallery', () => {
    const { communityMenu, mergeCommunityCatalog, COMMUNITY_PROJECTS } =
      jest.requireActual('./communityProjects')
    const cuties = {
      ...COMMUNITY_PROJECTS[0],
      slug: 'cuties-b9b5e204',
      name: 'Cuties',
      projectUrl: 'https://cuties.app/',
    }
    const catalog = mergeCommunityCatalog([cuties])
    const menu = communityMenu(catalog)
    expect(menu.count).toBe(COMMUNITY_PROJECTS.length + 1)
    expect(menu.apps.map((a: { slug: string }) => a.slug)).toEqual([
      'model-behavior-reports',
      'cuties-b9b5e204',
      'common-tongue',
      'distill',
    ])
    expect(menu.apps[1].image).toBe('/images/community/cuties-preview.webp')
  })
})
