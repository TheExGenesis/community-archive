import React from 'react'
import { render, waitFor } from '@testing-library/react'
import HashScrollHandler from './HashScrollHandler'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('<HashScrollHandler />', () => {
  afterEach(() => {
    window.location.hash = ''
    document.body.innerHTML = ''
  })

  it('scrolls to the current hash target', () => {
    window.location.hash = '#products'
    const target = document.createElement('section')
    target.id = 'products'
    target.scrollIntoView = jest.fn()
    document.body.appendChild(target)

    render(<HashScrollHandler />)

    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
  })

  it('scrolls when a streamed hash target is added later', async () => {
    window.location.hash = '#products'
    render(<HashScrollHandler />)

    const target = document.createElement('section')
    target.id = 'products'
    target.scrollIntoView = jest.fn()
    document.body.appendChild(target)

    await waitFor(() => {
      expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    })
  })
})
