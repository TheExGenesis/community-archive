/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OptInForm from '@/components/OptInForm'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    fill: _fill,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    void _fill

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={String(src)} alt={alt} {...props} />
    )
  },
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

jest.mock('@/hooks/useAuthAndArchive', () => ({
  useAuthAndArchive: () => ({
    userMetadata: {
      user_name: 'archive_member',
      provider_id: '42',
    },
  }),
}))

describe('OptInForm opted-in experience', () => {
  it('celebrates the opt-in and offers archive and exploration next steps', () => {
    render(
      <OptInForm userId="user-1" initialOptInStatus={{ opted_in: true }} />,
    )

    expect(
      screen.getByRole('heading', {
        name: 'Thanks for opting in!',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/keep your public tweets live from now on/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: /still need your archive to preserve your earlier tweets/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/can't reach tweets you posted before today/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/trend mapping and historical analysis/i),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('link', { name: /request your archive/i }),
    ).toHaveAttribute('href', 'https://x.com/settings/download_your_data')
    expect(
      screen.getByRole('link', { name: /upload your archive/i }),
    ).toHaveAttribute('href', '/#upload-archive')
    expect(screen.getByRole('link', { name: /bangers/i })).toHaveAttribute(
      'href',
      '/bangers',
    )
    expect(screen.getByRole('link', { name: /trends/i })).toHaveAttribute(
      'href',
      '/trends',
    )
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: /data policy/i })).toHaveAttribute(
      'href',
      '/data-policy',
    )
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute(
      'href',
      '/settings',
    )
    expect(
      screen.getByRole('img', { name: /dashboard preview/i }),
    ).toHaveAttribute('src', '/images/featured/dashboard.jpg')
    expect(
      screen.getByRole('img', { name: /bangers tweet rankings preview/i }),
    ).toHaveAttribute('src', '/images/featured/bangers-current.jpg')
    expect(
      screen.getByRole('img', { name: /trends preview/i }),
    ).toHaveAttribute('src', '/images/featured/trends.jpg')
  })

  it('previews opt-in locally in staging without calling the API', async () => {
    const user = userEvent.setup()
    const fetchSpy = jest.spyOn(global, 'fetch')

    render(<OptInForm userId="user-1" initialOptInStatus={null} mockOptIn />)

    expect(
      screen.getByText(/this button only changes this page/i),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /opt in to tweet streaming/i }),
    )

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', {
        name: 'Thanks for opting in!',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/no opt-in record was changed/i),
    ).toBeInTheDocument()

    fetchSpy.mockRestore()
  })
})
