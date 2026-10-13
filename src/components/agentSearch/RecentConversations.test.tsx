import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecentConversations } from './RecentConversations'

const conversations = [
  {
    id: 'c1',
    title: 'Who tweets about Singapore?',
    startedAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-09T10:00:00.000Z',
    turns: 1,
    status: 'completed' as const,
  },
  {
    id: 'c2',
    title: 'What do people say about burnout?',
    startedAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T10:00:00.000Z',
    turns: 2,
    status: 'completed' as const,
  },
]

test('deleting a conversation asks in the row first, and can be cancelled', async () => {
  const onDelete = jest.fn(async () => null)
  render(
    <RecentConversations
      conversations={conversations}
      onOpen={jest.fn()}
      onDelete={onDelete}
    />,
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Delete “Who tweets about Singapore?”',
    }),
  )
  expect(screen.getByText('Delete this conversation?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onDelete).not.toHaveBeenCalled()
  expect(screen.getByText('Who tweets about Singapore?')).toBeInTheDocument()

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Delete “Who tweets about Singapore?”',
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c1'))
})

test('a refused delete says why and keeps the row', async () => {
  const onDelete = jest.fn(async () => 'Stop the answer being written first.')
  render(
    <RecentConversations
      conversations={conversations}
      onOpen={jest.fn()}
      onDelete={onDelete}
    />,
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Delete “What do people say about burnout?”',
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(
    await screen.findByText('Stop the answer being written first.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
})

test('delete all history asks first and says today’s questions still count', async () => {
  const onDeleteAll = jest.fn(async () => null)
  render(
    <RecentConversations
      conversations={conversations}
      onOpen={jest.fn()}
      onDelete={jest.fn(async () => null)}
      onDeleteAll={onDeleteAll}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete all history' }))
  expect(
    screen.getByText(
      'Delete all 2 conversations? Today’s questions still count.',
    ),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete all' }))
  await waitFor(() => expect(onDeleteAll).toHaveBeenCalled())
})

test('without delete handlers the list offers no delete', () => {
  render(
    <RecentConversations conversations={conversations} onOpen={jest.fn()} />,
  )
  expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
})
