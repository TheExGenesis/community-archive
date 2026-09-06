import { fireEvent, render, screen } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import IntentLink from './IntentLink'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

test('prefetches an expensive destination once on intent, never on mount', () => {
  const prefetch = jest.fn()
  ;(useRouter as jest.Mock).mockReturnValue({ prefetch })
  const { rerender } = render(<IntentLink href="/user/alice">Alice</IntentLink>)
  expect(prefetch).not.toHaveBeenCalled()
  fireEvent.mouseEnter(screen.getByRole('link'))
  fireEvent.focus(screen.getByRole('link'))
  expect(prefetch).toHaveBeenCalledTimes(1)
  expect(prefetch).toHaveBeenCalledWith('/user/alice')
  rerender(<IntentLink href="/user/bob">Bob</IntentLink>)
  fireEvent.focus(screen.getByRole('link'))
  expect(prefetch).toHaveBeenLastCalledWith('/user/bob')
})
