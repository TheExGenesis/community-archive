/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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
        name: 'Yay—thank you so much for opting in!',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/archive your public tweets going forward/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/never need to upload again/i)).toBeInTheDocument()
    expect(
      screen.getByText(/that's completely fine. your opt-in still helps/i),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('link', { name: /request your x archive/i }),
    ).toHaveAttribute('href', 'https://x.com/settings/download_your_data')
    expect(
      screen.getByRole('link', { name: /upload it here/i }),
    ).toHaveAttribute('href', '/#upload-archive')
    expect(screen.getByRole('link', { name: /bangers/i })).toHaveAttribute(
      'href',
      '/bangers',
    )
    expect(
      screen.getByRole('link', { name: /keyword trends/i }),
    ).toHaveAttribute('href', '/trends')
    expect(
      screen.getByRole('link', { name: /manage privacy settings/i }),
    ).toHaveAttribute('href', '/profile')
  })
})
