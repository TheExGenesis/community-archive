import { fireEvent, render, screen } from '@testing-library/react'
import {
  PreviewAccount,
  PreviewHeroActions,
  PreviewSessionProvider,
} from './PreviewSession'

const renderPreview = (enabled: boolean) =>
  render(
    <PreviewSessionProvider enabled={enabled}>
      <PreviewHeroActions
        actual={<p>Actual hero</p>}
        signedIn={<p>Search hero</p>}
        signedOut={<p>Join hero</p>}
      />
      <PreviewAccount>
        <p>Actual account</p>
      </PreviewAccount>
    </PreviewSessionProvider>,
  )

it('switches presentation and restores the actual session view', () => {
  renderPreview(true)
  const select = screen.getByRole('combobox', { name: 'Preview sign-in state' })
  expect(screen.getByText('Actual hero')).toBeVisible()
  fireEvent.change(select, { target: { value: 'signed-in' } })
  expect(screen.getByText('Search hero')).toBeVisible()
  expect(screen.getByText('Preview account')).toBeVisible()
  expect(screen.queryByText('Actual account')).not.toBeInTheDocument()
  fireEvent.change(select, { target: { value: 'signed-out' } })
  expect(screen.getByText('Join hero')).toBeVisible()
  fireEvent.change(select, { target: { value: 'actual' } })
  expect(screen.getByText('Actual account')).toBeVisible()
})

it('does not expose controls or simulated views when disabled', () => {
  renderPreview(false)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.getByText('Actual hero')).toBeVisible()
  expect(screen.getByText('Actual account')).toBeVisible()
})
