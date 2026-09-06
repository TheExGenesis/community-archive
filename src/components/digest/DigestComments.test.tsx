/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DigestComments, type DigestComment } from './DigestComments'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const EDITION_ID = '11111111-2222-3333-4444-555555555555'

const comment = (overrides: Partial<DigestComment> = {}): DigestComment => ({
  id: 'comment-1',
  content: 'Great edition',
  username: 'alice',
  displayName: 'Alice',
  createdAt: '2026-08-27T12:00:00.000Z',
  isOwn: false,
  ...overrides,
})

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
})

describe('DigestComments', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('loads the thread and shows a sign-in prompt when signed out', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ comments: [comment()], count: 1 }),
      ) as unknown as typeof fetch

    render(<DigestComments editionId={EDITION_ID} initialCount={1} />)

    await waitFor(() => expect(screen.getByText('Alice')).toBeVisible())
    expect(screen.getByText('Great edition')).toBeVisible()
    expect(screen.getByText('1 Comment')).toBeVisible()
    expect(screen.getByText('Sign in to comment')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Post' })).toBeNull()
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/digest/${EDITION_ID}/comments`,
    )
  })

  test('renders an empty state when there are no comments', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ comments: [], count: 0 }),
      ) as unknown as typeof fetch

    render(<DigestComments editionId={EDITION_ID} />)

    await waitFor(() =>
      expect(screen.getByText('No comments yet.')).toBeVisible(),
    )
    expect(screen.getByText('0 Comments')).toBeVisible()
  })

  test('posts a comment and appends the API response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ comments: [], count: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({
          comment: comment({ id: 'comment-2', content: 'Nice', isOwn: true }),
        }),
      )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<DigestComments editionId={EDITION_ID} isSignedIn />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const textarea = screen.getByPlaceholderText('Add a comment')
    fireEvent.change(textarea, { target: { value: '  Nice  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(screen.getByText('Nice')).toBeVisible())
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/digest/${EDITION_ID}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Nice' }),
      },
    )
    expect(screen.getByText('1 Comment')).toBeVisible()
    expect(textarea).toHaveValue('')
  })

  test('deletes an own comment and restores it when the request fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          comments: [comment({ content: 'Mine', isOwn: true })],
          count: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<DigestComments editionId={EDITION_ID} isSignedIn />)
    await waitFor(() => expect(screen.getByText('Mine')).toBeVisible())

    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))

    await waitFor(() =>
      expect(
        screen.getByText('Could not delete your comment. Please try again.'),
      ).toBeVisible(),
    )
    expect(screen.getByText('Mine')).toBeVisible()
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/digest/${EDITION_ID}/comments/comment-1`,
      { method: 'DELETE' },
    )
  })

  test('does not show a delete button on other readers comments', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ comments: [comment()], count: 1 }),
      ) as unknown as typeof fetch

    render(<DigestComments editionId={EDITION_ID} isSignedIn />)

    await waitFor(() => expect(screen.getByText('Alice')).toBeVisible())
    expect(screen.queryByRole('button', { name: 'Delete comment' })).toBeNull()
  })
})
