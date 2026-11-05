import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { MarkdownField } from './MarkdownField'

test('loads Markdown and submits edits, formatting, and safe pasted links', async () => {
  const { container } = render(
    <form aria-label="Digest draft">
      <MarkdownField
        name="summary"
        label="Summary"
        defaultValue="**Archive** [source](https://example.com)"
        maxLength={1000}
      />
    </form>,
  )
  const textbox = await screen.findByRole('textbox', { name: 'Summary' })
  expect(textbox.querySelector('strong')).toHaveTextContent('Archive')
  expect(textbox.querySelector('a')).toHaveAttribute(
    'href',
    'https://example.com',
  )
  const editor = (textbox as HTMLElement & { editor: Editor }).editor
  const submitted = () =>
    container.querySelector<HTMLInputElement>('input[name="summary"]')!.value
  expect(submitted()).toBe('**Archive** [source](https://example.com)')

  act(() => {
    editor.commands.setContent('Updated copy', { contentType: 'markdown' })
    editor.commands.selectAll()
  })
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
  await waitFor(() => expect(submitted()).toBe('**Updated copy**'))

  act(() => {
    editor.commands.selectAll()
    editor.view.pasteHTML(
      '<p><a href="javascript:alert(1)">Unsafe</a> <a href="https://example.com/safe">Safe</a><img src="x" onerror="alert(1)"></p>',
      new Event('paste') as ClipboardEvent,
    )
  })
  await waitFor(() =>
    expect(submitted()).toContain('[Safe](https://example.com/safe)'),
  )
  expect(submitted()).toContain('Unsafe')
  expect(String(submitted())).not.toMatch(/javascript:|onerror|<img/i)
  expect(
    textbox.querySelector('[href^="javascript:"], img, [onerror]'),
  ).toBeNull()
})
