import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommunityGallery from './CommunityGallery'

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
    expect(screen.getByText('10 projects')).toBeInTheDocument()

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
})
