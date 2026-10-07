import {
  type CommunityProjectRow,
  mapCommunityProjectRow,
} from '@/lib/communityProjectDatabase'

const projectRow: CommunityProjectRow = {
  id: '79f33a88-91b8-4486-bc24-aaad1c0a44c2',
  slug: 'example-project',
  name: 'Example Project',
  project_url: 'https://example.com/',
  creator_name: 'Example Creator',
  creator_handle: null,
  category: 'Tools',
  description: 'A voice-first journal with AI reflection.',
  summary: null,
  archive_use: 'Uses archived posts to seed a personal profile.',
  source_post_url: 'https://x.com/example/status/1234567890',
  tags: ['journaling'],
  cover_storage_path:
    '1dc9a3f8-a243-4627-b81a-ff491c62a475/79f33a88-91b8-4486-bc24-aaad1c0a44c2-c2f50181.png',
  cover_mime_type: 'image/png',
  submitter_username: 'sage',
  status: 'published',
  featured: false,
  submitted_at: '2026-09-02T21:34:06.000Z',
  published_at: '2026-09-02T23:35:06.465Z',
}

describe('mapCommunityProjectRow', () => {
  it('versions database cover URLs with their storage path', () => {
    expect(mapCommunityProjectRow(projectRow).image).toBe(
      '/api/community/projects/79f33a88-91b8-4486-bc24-aaad1c0a44c2/cover?v=1dc9a3f8-a243-4627-b81a-ff491c62a475%2F79f33a88-91b8-4486-bc24-aaad1c0a44c2-c2f50181.png',
    )
  })

  it('does not turn a first-party project URL into a duplicate source link', () => {
    const project = mapCommunityProjectRow({
      ...projectRow,
      project_url: '/bangers',
      source_post_url: '/bangers',
    })
    expect(project.projectUrl).toBe('/bangers')
    expect(project.sourceUrl).toBeUndefined()
    expect(project.sourceTweetId).toBeUndefined()
  })

  it('leads cards with the first sentence of a submitted description', () => {
    const project = mapCommunityProjectRow({
      ...projectRow,
      description:
        'A voice-first journal with AI reflection. It also exports to v1.2 PDFs.',
    })
    expect(project.summary).toBe('A voice-first journal with AI reflection.')
    expect(project.description).toContain('exports to v1.2 PDFs.')
  })

  it('prefers a headline an admin wrote over the derived one', () => {
    const derived = mapCommunityProjectRow(projectRow)
    expect(derived.summaryEdited).toBe(false)

    const edited = mapCommunityProjectRow({
      ...projectRow,
      summary: 'Journal out loud.',
    })
    expect(edited.summary).toBe('Journal out loud.')
    expect(edited.summaryEdited).toBe(true)
  })

  it('does not end the summary at punctuation inside a project name', () => {
    const project = mapCommunityProjectRow({
      ...projectRow,
      description:
        'Cuties! is a community-driven social app and vouch network. People use it to find friends.',
    })
    expect(project.summary).toBe(
      'Cuties! is a community-driven social app and vouch network.',
    )
  })
})
