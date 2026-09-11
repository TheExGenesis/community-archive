import { fireEvent, render, screen } from '@testing-library/react'
import { requireBulletinUser } from '@/lib/bulletin/data'
import BulletinPage from './page'

jest.mock('@/components/bulletin/BulletinBoard.module.css', () => ({}))
jest.mock('@/lib/bulletin/data', () => ({
  requireBulletinUser: jest.fn(),
  isBulletinAdmin: jest.fn(async () => false),
}))
jest.mock('@/lib/bulletin/page', () => ({
  loadBulletinPage: jest.fn(async () => ({ notices: [], personal: {} })),
}))
jest.mock('@/lib/bulletin/prompts', () => ({ loadPrompts: jest.fn() }))
jest.mock('@/components/bulletin/RefreshControls', () => ({
  RefreshControls: () => null,
}))
jest.mock('@/components/bulletin/BulletinBoard', () => ({
  BulletinBoard: function Board() {
    const [open, setOpen] = require('react').useState(false)
    return (
      <button onClick={() => setOpen(true)}>
        {open ? 'Expanded tweet' : 'Read tweet'}
      </button>
    )
  },
}))

afterEach(() => jest.restoreAllMocks())

test('server refresh preserves board state but changing the viewer resets it', async () => {
  jest.mocked(requireBulletinUser).mockResolvedValue({ id: 'alice' } as never)
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000)
  const { rerender } = render(await BulletinPage())
  fireEvent.click(screen.getByRole('button', { name: 'Read tweet' }))
  clock.mockReturnValue(16000)
  rerender(await BulletinPage())
  expect(
    screen.getByRole('button', { name: 'Expanded tweet' }),
  ).toBeInTheDocument()

  jest.mocked(requireBulletinUser).mockResolvedValue({ id: 'bob' } as never)
  rerender(await BulletinPage())
  expect(screen.getByRole('button', { name: 'Read tweet' })).toBeInTheDocument()
})
