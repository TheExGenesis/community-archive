import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionPreferenceControl } from './CollectionPreferenceControl'
import {
  loadCollectionPreference,
  saveCollectionPreference,
} from '@/lib/collectionPreference'

jest.mock('@/lib/collectionPreference', () => ({
  loadCollectionPreference: jest.fn(),
  saveCollectionPreference: jest.fn(),
}))
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(loadCollectionPreference)
    .mockResolvedValue({ accountId: '42', enabled: true, uploadEnabled: true })
  jest.mocked(saveCollectionPreference).mockResolvedValue(undefined)
})

test('settings can disable ongoing collection without changing membership', async () => {
  render(<CollectionPreferenceControl />)
  await screen.findByText('Ongoing collection is on.')
  await userEvent.click(
    screen.getByRole('switch', { name: 'Ongoing collection' }),
  )
  await screen.findByText('Archive only: ongoing collection is off.')
  expect(saveCollectionPreference).toHaveBeenCalledWith('42', false)
})
test('failed saves retain the visible persisted setting', async () => {
  jest.mocked(saveCollectionPreference).mockRejectedValue(new Error('offline'))
  render(<CollectionPreferenceControl />)
  await screen.findByText('Ongoing collection is on.')
  await userEvent.click(screen.getByRole('switch'))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your preference was not changed',
  )
  expect(screen.getByRole('switch')).toBeChecked()
})
test('load failure disables changes and offers a retry', async () => {
  jest
    .mocked(loadCollectionPreference)
    .mockRejectedValueOnce(new Error('offline'))
  render(<CollectionPreferenceControl />)
  await screen.findByRole('alert')
  expect(screen.getByRole('switch')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled())
})
