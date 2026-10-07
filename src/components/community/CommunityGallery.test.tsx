import { capturePostHogEvent } from '@/lib/posthog'
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))
jest.mock('@/app/admin/communitySubmissionActions', () => ({
  editPublishedCommunityProject: jest.fn(),
}))
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))
import { render, screen, waitFor } from '@testing-library/react'
import { editPublishedCommunityProject } from '@/app/admin/communitySubmissionActions'
import userEvent from '@testing-library/user-event'
import CommunityGallery from './CommunityGallery'
import {
  COMMUNITY_PROJECTS,
  type CommunityProject,
} from '@/lib/communityProjects'

const PUBLISHED_PROJECT: CommunityProject = {
  databaseId: '8c21b2b5-3530-4ec8-9729-07635b28b692',
  slug: 'archive-quilt',
  name: 'Archive Quilt',
  creator: 'Ada',
  summary: 'A visual map of recurring conversations.',
  description: 'A visual map of recurring conversations.',
  archiveUse: 'It groups public posts into visual conversation clusters.',
  category: 'Tools',
  tags: ['Visualization'],
  projectUrl: 'https://example.org/archive-quilt',
  sourceTweetId: '123',
  sourceUrl: 'https://x.com/example/status/123',
  coverClass: 'from-[#8BD2EE] via-[#75C9EB] to-[#25AADF]',
  featured: false,
  publishedAt: '2026-08-20',
  likeCount: 2,
  commentCount: 1,
}

const DATABASE_COVER_URL =
  '/api/community/projects/8c21b2b5-3530-4ec8-9729-07635b28b692/cover?v=cover.png'

async function openPublishedProject(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole('searchbox', { name: 'Search community projects' }),
    'Archive Quilt',
  )
  await user.click(
    screen.getByRole('button', { name: /Archive Quilt by Ada/i }),
  )
}

describe('CommunityGallery', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('hides editing from non-admin readers', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery publishedProjects={[PUBLISHED_PROJECT]} />)
    await openPublishedProject(user)

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('lets an admin edit a curated project from its dialog', async () => {
    // The shared Jest fetch polyfill replaces JSDOM FormData with undici's
    // non-DOM constructor. Match browser form collection for this test.
    const FetchFormData = global.FormData
    jest.spyOn(window, 'FormData').mockImplementation((form) => {
      const data = new FetchFormData()
      if (form)
        Array.from(form.elements).forEach((element) => {
          if (
            (element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement) &&
            element.name
          )
            data.append(element.name, element.value)
        })
      return data
    })
    const mockEdit = editPublishedCommunityProject as jest.MockedFunction<
      typeof editPublishedCommunityProject
    >
    mockEdit.mockResolvedValue({ ok: true, projectId: 'id' })
    const user = userEvent.setup()
    render(<CommunityGallery isAdmin />)

    await user.click(
      screen.getByRole('button', { name: /New Words and Their Pioneers by/i }),
    )
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const projectUrl = screen.getByLabelText('Project URL')
    expect(projectUrl).toHaveValue(
      'https://guileless-tanuki-32174a.netlify.app/',
    )
    expect(screen.getByLabelText('Source post URL (optional)')).toHaveValue(
      'https://x.com/IvanVendrov/status/1892730504702566541',
    )
    expect(screen.getByRole('checkbox', { name: /Featured/ })).toBeChecked()
    expect(screen.getByLabelText(/Card headline/)).toHaveValue(
      'Trace emerging language through the people who used it first.',
    )
    await user.clear(projectUrl)
    await user.type(projectUrl, 'https://example.org/new-words')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockEdit).toHaveBeenCalledTimes(1))
    const submitted = mockEdit.mock.calls[0][0]
    expect(submitted.get('projectSlug')).toBe('new-words-and-their-pioneers')
    expect(submitted.get('projectUrl')).toBe('https://example.org/new-words')
    expect(submitted.get('summary')).toBe(
      'Trace emerging language through the people who used it first.',
    )
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('searches and filters the verified project catalog', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery />)

    expect(
      screen.getByRole('heading', {
        name: 'Discover community-made tools, bots, visualizations, and more',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('17 projects')).toBeInTheDocument()

    await user.type(
      screen.getByRole('searchbox', { name: 'Search community projects' }),
      'radio',
    )
    expect(screen.getByText('1 project')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Community Archive Radio by/i }),
    ).toBeInTheDocument()

    await user.clear(
      screen.getByRole('searchbox', { name: 'Search community projects' }),
    )
    await user.click(screen.getByRole('button', { name: 'Games' }))
    expect(screen.getByText('1 project')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Followle by/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Research' }))
    expect(screen.getByText('2 projects')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Model Behavior Reports by/i }),
    ).toBeInTheDocument()
  })

  it('opens an accessible project modal without creating a detail page', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery />)

    await user.click(
      screen.getByRole('button', { name: /Tweet Harvest.*Loopy/i }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Tweet Harvest' }),
    ).toBeInTheDocument()
    expect(capturePostHogEvent).toHaveBeenCalledWith('community_app_action', {
      action: 'details_opened',
      app_slug: 'tweet-harvest',
      source: 'gallery_card',
    })
    await user.click(screen.getByRole('link', { name: /Open project/i }))
    expect(capturePostHogEvent).toHaveBeenLastCalledWith(
      'community_app_action',
      {
        action: 'launch_clicked',
        app_slug: 'tweet-harvest',
        source: 'gallery_dialog',
        external: true,
      },
    )
    expect(screen.getByText('How it uses the archive')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open project/i })).toHaveAttribute(
      'href',
      'https://strangestloop.io/tweet-harvest/',
    )
    expect(
      screen.queryByRole('link', { name: /View full page/i }),
    ).not.toBeInTheDocument()
  })

  it('loads database-backed covers directly instead of through the image optimizer', async () => {
    render(
      <CommunityGallery
        publishedProjects={[
          { ...PUBLISHED_PROJECT, image: DATABASE_COVER_URL },
        ]}
      />,
    )

    const covers = screen.getAllByRole('img', {
      name: 'Preview of Archive Quilt',
    })
    expect(covers).toHaveLength(1)
    expect(covers[0]).toHaveAttribute('src', DATABASE_COVER_URL)
    expect(covers[0]).not.toHaveAttribute('srcset')
  })

  it('opens the Conversation Map internally without inventing a source post', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery />)
    await user.click(
      screen.getByRole('button', {
        name: /Conversation Map.*Community Archive/i,
      }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Conversation Map' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open project/i })).toHaveAttribute(
      'href',
      '/conversation-map',
    )
    expect(
      screen.getByRole('link', { name: /Open project/i }),
    ).not.toHaveAttribute('target')
    expect(
      screen.queryByRole('link', { name: 'View source post' }),
    ).not.toBeInTheDocument()
  })

  it('shows one continuous grid and preserves the curated Tools order when filtered', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery />)

    expect(
      screen.getByRole('heading', { name: 'All projects' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Tools' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Research' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Browse all tools' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Featured' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getAllByRole('button', { name: /Preview of/ })[0],
    ).toHaveAccessibleName(/Bangers/)
    expect(
      screen
        .getAllByRole('button')
        .filter((button) =>
          /Bangers\.page|Tweet Harvest|Semantic Search|Malcolm Ocean's Links|Distill|Tweetscope/.test(
            button.textContent ?? '',
          ),
        )
        .map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining('Bangers.page'),
      expect.stringContaining('Tweet Harvest'),
      expect.stringContaining('Semantic Search'),
      expect.stringContaining("Malcolm Ocean's Links"),
      expect.stringContaining('Distill'),
      expect.stringContaining('Tweetscope'),
    ])

    await user.click(screen.getByRole('button', { name: 'Tools' }))
    expect(screen.getByText('9 projects')).toBeInTheDocument()
  })

  it('leads each card with its one-line summary, then name and creator', () => {
    const pairwise = COMMUNITY_PROJECTS.find(
      (project) => project.slug === 'pairwise',
    )!
    render(
      <CommunityGallery
        publishedProjects={[
          // A backfilled row only carries the long description.
          { ...pairwise, summary: pairwise.description },
        ]}
      />,
    )

    const card = screen.getByRole('button', { name: /Pairwise by Loopy/ })
    expect(card).toHaveTextContent(
      `${pairwise.summary}${pairwise.name} by ${pairwise.creator}`,
    )
    expect(screen.queryByText(/Free/)).not.toBeInTheDocument()
  })

  it('applies cover and summary overrides to a submitted project', () => {
    const pairwise = COMMUNITY_PROJECTS.find(
      (project) => project.slug === 'pairwise',
    )!
    render(
      <CommunityGallery
        publishedProjects={[
          {
            ...pairwise,
            databaseId: 'b9b5e204-282a-47be-841f-74dd182ddbf5',
            slug: 'cuties-b9b5e204',
            name: 'Cuties!',
            creator: 'Christine',
            summary: 'Cuties!',
            image: '/api/community/projects/b9b5e204/cover?v=1',
          },
        ]}
      />,
    )

    const card = screen.getByRole('button', { name: /Cuties! by Christine/ })
    expect(card).toHaveTextContent(
      'Find friends, opportunities, and dates through a community vouch network.',
    )
    expect(
      decodeURIComponent(
        screen.getByAltText('Preview of Cuties!').getAttribute('src') ?? '',
      ),
    ).toContain('/images/community/cuties-preview.webp')
  })

  it('shows hearts for curated cards once their published rows are loaded', () => {
    const slugs = [
      'bangers',
      'pairwise',
      'birdseye',
      'strands',
      'model-behavior-reports',
    ]
    const publishedProjects = slugs.map((slug, index) => ({
      ...COMMUNITY_PROJECTS.find((project) => project.slug === slug)!,
      databaseId: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      likeCount: 0,
    }))

    render(<CommunityGallery publishedProjects={publishedProjects} />)

    for (const project of publishedProjects) {
      expect(
        screen.getByRole('button', { name: `Like ${project.name}` }),
      ).toBeInTheDocument()
    }
  })

  it('submits a project to the approval queue', async () => {
    const user = userEvent.setup()
    const FetchFormData = global.FormData
    jest.spyOn(window, 'FormData').mockImplementation((form) => {
      const data = new FetchFormData()
      if (form) {
        Array.from(form.elements).forEach((element) => {
          if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
          ) {
            if (element.name && element.type !== 'file') {
              data.append(element.name, element.value)
            }
          }
        })
      }
      return data
    })
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        id: '8c21b2b5-3530-4ec8-9729-07635b28b692',
      }),
    } as Response)
    render(<CommunityGallery />)

    await user.click(screen.getByRole('button', { name: 'Submit a project' }))
    expect(
      screen.getByRole('dialog', { name: 'Submit a project' }),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Project name'), 'Archive Quilt')
    await user.type(
      screen.getByLabelText('Project URL'),
      'https://example.org/archive-quilt',
    )
    await user.type(screen.getByLabelText('Your name'), 'Ada')
    await user.type(
      screen.getByLabelText('Short description'),
      'A visual map of recurring conversations.',
    )
    await user.type(
      screen.getByLabelText('How does it use Community Archive data?'),
      'It groups public posts into visual conversation clusters.',
    )
    await user.type(
      screen.getByLabelText('Launch/source post'),
      'https://x.com/example/status/123',
    )
    await user.click(
      screen.getByRole('button', { name: 'Submit for approval' }),
    )

    expect(
      screen.getByRole('heading', {
        name: 'Your project is in the approval queue',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/An admin will review it/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/community/submissions',
      expect.objectContaining({ method: 'POST' }),
    )
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(requestBody.get('projectName')).toBe('Archive Quilt')
  })

  it('likes a project straight from its gallery card', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ liked: true, count: 3 }),
    } as Response)

    render(
      <CommunityGallery
        isSignedIn
        publishedProjects={[PUBLISHED_PROJECT]}
        likedProjectSlugs={[]}
      />,
    )

    await user.type(
      screen.getByRole('searchbox', { name: 'Search community projects' }),
      'Archive Quilt',
    )

    const cardLike = screen.getByRole('button', { name: 'Like Archive Quilt' })
    expect(cardLike).toHaveTextContent('2')

    await user.click(cardLike)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/community/projects/${PUBLISHED_PROJECT.slug}/like`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Unlike Archive Quilt' }),
    ).toHaveTextContent('3')
    // The card like must not open the project modal.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('likes a checked-in project without a database row', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ liked: true, count: 5 }),
    } as Response)

    render(<CommunityGallery isSignedIn likeCounts={{ 'tpot-trust': 4 }} />)
    await user.type(
      screen.getByRole('searchbox', { name: 'Search community projects' }),
      'Tpot-Trust',
    )

    const likeButton = screen.getByRole('button', { name: 'Like Tpot-Trust' })
    expect(likeButton).toHaveTextContent('4')
    await user.click(likeButton)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/community/projects/tpot-trust/like',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Unlike Tpot-Trust' }),
    ).toHaveTextContent('5')
  })

  it('optimistically likes a published project and calls the like API', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ liked: true, count: 3 }),
    } as Response)

    render(
      <CommunityGallery
        isSignedIn
        publishedProjects={[PUBLISHED_PROJECT]}
        likedProjectSlugs={[]}
      />,
    )

    await openPublishedProject(user)

    const likeButton = screen.getByRole('button', {
      name: 'Like Archive Quilt',
    })
    expect(likeButton).toHaveTextContent('2')

    await user.click(likeButton)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/community/projects/${PUBLISHED_PROJECT.slug}/like`,
      expect.objectContaining({ method: 'POST' }),
    )
    const liked = await screen.findByRole('button', {
      name: 'Unlike Archive Quilt',
    })
    expect(liked).toHaveTextContent('3')
  })

  it('unlikes a project the signed-in user already liked', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ liked: false, count: 1 }),
    } as Response)

    render(
      <CommunityGallery
        isSignedIn
        publishedProjects={[PUBLISHED_PROJECT]}
        likedProjectSlugs={[PUBLISHED_PROJECT.slug]}
      />,
    )

    await openPublishedProject(user)

    await user.click(
      screen.getByRole('button', { name: 'Unlike Archive Quilt' }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/community/projects/${PUBLISHED_PROJECT.slug}/like`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    const unliked = await screen.findByRole('button', {
      name: 'Like Archive Quilt',
    })
    expect(unliked).toHaveTextContent('1')
  })

  it('shows the like count but does not call the API when signed out', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.spyOn(global, 'fetch')

    render(
      <CommunityGallery
        isSignedIn={false}
        publishedProjects={[PUBLISHED_PROJECT]}
      />,
    )

    await openPublishedProject(user)

    const likeButton = screen.getByRole('button', {
      name: 'Sign in to like',
    })
    expect(likeButton).toHaveAttribute('title', 'Sign in to like')
    expect(likeButton).toHaveTextContent('2')

    await user.click(likeButton)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Sign in to like' }),
    ).toHaveTextContent('2')
  })

  it('hides comments in the gallery for now', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.spyOn(global, 'fetch')

    render(
      <CommunityGallery isSignedIn publishedProjects={[PUBLISHED_PROJECT]} />,
    )
    await openPublishedProject(user)

    // The modal must not render the comment thread or fetch the comments API.
    expect(screen.queryByText('Comments')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('offers a most liked sort option', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery publishedProjects={[PUBLISHED_PROJECT]} />)

    const sortButton = screen.getByRole('button', { name: 'Most liked' })
    await user.click(sortButton)
    expect(sortButton).toHaveAttribute('aria-pressed', 'true')
  })
})

beforeEach(() => {
  jest.mocked(capturePostHogEvent).mockClear()
})

it('tracks newly published apps after filtering without copying project content', async () => {
  const user = userEvent.setup()
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ comments: [] }),
  } as Response)
  render(<CommunityGallery publishedProjects={[PUBLISHED_PROJECT]} />)
  await openPublishedProject(user)
  await user.click(screen.getByRole('link', { name: /Open project/i }))
  expect(capturePostHogEvent).toHaveBeenLastCalledWith('community_app_action', {
    action: 'launch_clicked',
    app_slug: 'archive-quilt',
    source: 'gallery_dialog',
    external: true,
  })
})
