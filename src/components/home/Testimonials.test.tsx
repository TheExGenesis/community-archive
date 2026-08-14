import { render, screen } from '@testing-library/react'
import Testimonials from './Testimonials'

describe('Testimonials', () => {
  it('shows the expanded archive-linked testimonial grid', () => {
    render(<Testimonials />)

    expect(
      screen.getByRole('heading', { name: 'Testimonials' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Search that finds the posts people remember/i),
    ).not.toBeInTheDocument()

    const links = screen.getAllByRole('link', {
      name: /View in the archive/i,
    })
    expect(links).toHaveLength(15)
    const hrefs = links.map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/tweets/1993170617127125031',
        '/tweets/2007262234976850305',
        '/tweets/2061928297399738618',
      ]),
    )
    for (const href of hrefs) {
      expect(href).toMatch(/^\/tweets\/\d+$/)
    }

    expect(links[0].closest('.grid')).toHaveClass(
      'sm:grid-cols-2',
      'lg:grid-cols-3',
    )
  })
})
