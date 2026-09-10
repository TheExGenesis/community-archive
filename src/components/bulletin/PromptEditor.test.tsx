import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PromptEditor } from './PromptEditor'
import { savePrompt } from '@/app/admin/bulletin/actions'
import type { PromptDashboard } from '@/lib/bulletin/types'
jest.mock('@/app/admin/bulletin/actions', () => ({
  savePrompt: jest.fn(),
}))
const original = {
  id: '1',
  body: 'Original prompt',
  note: 'Initial',
  created_at: '2026-09-09T00:00:00Z',
  created_by: null,
}
const data: PromptDashboard = { active: original, versions: [original] }
beforeEach(() => jest.clearAllMocks())
test('restoring copies a draft and saving creates a version without overwriting history', async () => {
  jest.mocked(savePrompt).mockResolvedValue({ version: '3' })
  render(
    <PromptEditor
      data={{
        active: { ...original, id: '2', body: 'Current prompt' },
        versions: [original],
      }}
    />,
  )
  fireEvent.click(screen.getByText('Use as draft'))
  expect(screen.getByLabelText('Prompt for future runs')).toHaveValue(
    'Original prompt',
  )
  expect(screen.getByLabelText('What changed?')).toHaveValue(
    'Restore version 1',
  )
  expect(savePrompt).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save for future runs' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Version 3 saved'),
  )
  const form = jest.mocked(savePrompt).mock.calls[0][0]
  expect(form.get('expected_id')).toBe('2')
  expect(form.get('body')).toBe('Original prompt')
})
test('conflict preserves draft and note', async () => {
  jest
    .mocked(savePrompt)
    .mockResolvedValue({ error: 'Another edit was saved first.' })
  render(<PromptEditor data={data} />)
  fireEvent.change(screen.getByLabelText('Prompt for future runs'), {
    target: { value: 'My edit' },
  })
  fireEvent.change(screen.getByLabelText('What changed?'), {
    target: { value: 'My note' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save for future runs' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Another edit'),
  )
  expect(screen.getByLabelText('Prompt for future runs')).toHaveValue('My edit')
  expect(screen.getByLabelText('What changed?')).toHaveValue('My note')
})
test('production read preview allows drafting but not saving', () => {
  render(<PromptEditor data={{ ...data, read_only: true }} />)
  fireEvent.change(screen.getByLabelText('Prompt for future runs'), {
    target: { value: 'My edit' },
  })
  fireEvent.change(screen.getByLabelText('What changed?'), {
    target: { value: 'My note' },
  })
  expect(
    screen.getByRole('button', { name: 'Save for future runs' }),
  ).toBeDisabled()
})
