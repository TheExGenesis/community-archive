import { render, screen } from '@testing-library/react'
import { loadPrompts } from '@/lib/bulletin/prompts'
import { BulletinRefreshControls } from './refresh-controls'

jest.mock('@/lib/bulletin/prompts', () => ({ loadPrompts: jest.fn() }))
jest.mock('@/components/bulletin/RefreshControls', () => ({
  RefreshControls: ({ promptId }: { promptId: string }) => (
    <button>Refresh with prompt {promptId}</button>
  ),
}))

test('streams refresh controls with the active prompt', async () => {
  jest.mocked(loadPrompts).mockResolvedValue({ active: { id: '2' } } as never)
  render(await BulletinRefreshControls())
  expect(
    screen.getByRole('button', { name: 'Refresh with prompt 2' }),
  ).toBeInTheDocument()
})

test('an unavailable admin prompt does not fail the board', async () => {
  jest.mocked(loadPrompts).mockRejectedValue(new Error('unavailable'))
  expect(await BulletinRefreshControls()).toBeNull()
})
