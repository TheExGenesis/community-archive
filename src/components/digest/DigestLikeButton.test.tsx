/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DigestLikeButton } from './DigestLikeButton'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const EDITION_ID = '11111111-2222-3333-4444-555555555555'

describe('DigestLikeButton', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('routes to sign-in when clicked while signed out', () => {
    const location = { pathname: '/digest/2026-08-20', href: '' }
    jest
      .spyOn(window, 'location', 'get')
      .mockReturnValue(location as unknown as Location)

    render(<DigestLikeButton editionId={EDITION_ID} initialCount={7} />)

    const button = screen.getByRole('button', { name: 'Sign in to like' })
    expect(button).toHaveAttribute('title', 'Sign in to like')
    expect(screen.getByText('7')).toBeVisible()

    fireEvent.click(button)
    expect(location.href).toBe('/login?redirect=%2Fdigest%2F2026-08-20')
  })

  test('optimistically likes and reconciles with the API count', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ liked: true, count: 9 }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(
      <DigestLikeButton editionId={EDITION_ID} initialCount={7} isSignedIn />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Like this edition' }))

    expect(screen.getByText('8')).toBeVisible()
    await waitFor(() => expect(screen.getByText('9')).toBeVisible())
    expect(fetchMock).toHaveBeenCalledWith(`/api/digest/${EDITION_ID}/like`, {
      method: 'POST',
    })
    expect(
      screen.getByRole('button', { name: 'Unlike this edition' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('unlikes with DELETE when already liked', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ liked: false, count: 6 }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(
      <DigestLikeButton
        editionId={EDITION_ID}
        initialCount={7}
        initialLiked
        isSignedIn
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unlike this edition' }))

    await waitFor(() => expect(screen.getByText('6')).toBeVisible())
    expect(fetchMock).toHaveBeenCalledWith(`/api/digest/${EDITION_ID}/like`, {
      method: 'DELETE',
    })
  })

  test('reverts the optimistic update when the request fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch

    render(
      <DigestLikeButton editionId={EDITION_ID} initialCount={7} isSignedIn />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Like this edition' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Like this edition' }),
      ).toHaveAttribute('aria-pressed', 'false'),
    )
    expect(screen.getByText('7')).toBeVisible()
  })
})
