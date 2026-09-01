import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommunityGallery from './CommunityGallery'
import type { CommunityProject } from '@/lib/communityProjects'

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

  it('searches and filters the verified project catalog', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery />)

    expect(
      screen.getByRole('heading', {
        name: 'Discover community-made tools, bots, visualizations, and more',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('11 projects')).toBeInTheDocument()

    await user.type(
      screen.getByRole('searchbox', { name: 'Search community projects' }),
      'radio',
    )
    expect(screen.getByText('1 project')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Community Archive Radio/i }),
    ).toBeInTheDocument()

    await user.clear(
      screen.getByRole('searchbox', { name: 'Search community projects' }),
    )
    await user.click(screen.getByRole('button', { name: 'Games' }))
    expect(screen.getByText('1 project')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Followle/i }),
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
    expect(screen.getByText('How it uses the archive')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open project/i })).toHaveAttribute(
      'href',
      'https://strangestloop.io/tweet-harvest/',
    )
    expect(
      screen.queryByRole('link', { name: /View full page/i }),
    ).not.toBeInTheDocument()
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

  it('shows every curated Tools card across rows in the requested order', async () => {
    const user = userEvent.setup()
    render(<CommunityGallery />)

    expect(
      screen.queryByRole('button', { name: 'Browse all tools' }),
    ).not.toBeInTheDocument()
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
    expect(screen.getByText('6 projects')).toBeInTheDocument()
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
        likedProjectIds={[]}
      />,
    )

    await openPublishedProject(user)

    const likeButton = screen.getByRole('button', {
      name: 'Like Archive Quilt',
    })
    expect(likeButton).toHaveTextContent('2')

    await user.click(likeButton)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/community/projects/${PUBLISHED_PROJECT.databaseId}/like`,
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
        likedProjectIds={[PUBLISHED_PROJECT.databaseId!]}
      />,
    )

    await openPublishedProject(user)

    await user.click(
      screen.getByRole('button', { name: 'Unlike Archive Quilt' }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/community/projects/${PUBLISHED_PROJECT.databaseId}/like`,
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
