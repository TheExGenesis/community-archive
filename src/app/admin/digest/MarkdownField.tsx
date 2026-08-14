'use client'

import CharacterCount from '@tiptap/extension-character-count'
import Link from '@tiptap/extension-link'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code2,
  Italic,
  Link2,
  Redo2,
  Strikethrough,
  Undo2,
  Unlink2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const toolbarButtonClass =
  'inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-zinc-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-35 dark:hover:bg-zinc-800'

function ToolbarButton({
  label,
  active,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`${toolbarButtonClass} ${active ? 'bg-zinc-200 text-foreground dark:bg-zinc-800' : ''}`}
    >
      {children}
    </button>
  )
}

export function MarkdownField({
  name,
  label,
  defaultValue,
  maxLength,
  editorClassName = '',
}: {
  name: string
  label: string
  defaultValue: string
  maxLength: number
  editorClassName?: string
}) {
  const [markdown, setMarkdown] = useState(defaultValue.trim())
  const [characterCount, setCharacterCount] = useState(defaultValue.length)
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
      }),
      CharacterCount.configure({ limit: maxLength }),
      Markdown,
    ],
    [maxLength],
  )
  const editor = useEditor({
    extensions,
    content: defaultValue,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        class: `min-h-[68px] px-3 py-2 outline-none [&_a]:text-brand [&_a]:underline [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_code]:py-0.5 [&_p]:m-0 dark:[&_code]:bg-zinc-900 ${editorClassName}`,
        role: 'textbox',
      },
    },
    onCreate: ({ editor: currentEditor }) => {
      setMarkdown(currentEditor.getMarkdown().trim())
      setCharacterCount(currentEditor.storage.characterCount.characters())
    },
    onUpdate: ({ editor: currentEditor }) => {
      setMarkdown(currentEditor.getMarkdown().trim())
      setCharacterCount(currentEditor.storage.characterCount.characters())
    },
  })

  useEffect(() => {
    if (!editor) return
    const next = defaultValue.trim()
    if (editor.getMarkdown().trim() === next) return
    editor.commands.setContent(defaultValue, { contentType: 'markdown' })
    setMarkdown(next)
    setCharacterCount(editor.storage.characterCount.characters())
  }, [defaultValue, editor])

  const editLink = () => {
    if (!editor) return
    const currentHref = String(editor.getAttributes('link').href ?? '')
    const href = window.prompt('Link URL', currentHref || 'https://')
    if (href === null) return
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: href.trim() })
      .run()
  }

  return (
    <div className="group/markdown mt-1 overflow-hidden rounded-md border bg-background focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-brand/30">
      <input type="hidden" name={name} value={markdown} readOnly />
      <div className="min-h-9 flex items-center justify-between gap-2 border-b bg-zinc-50 px-2 dark:bg-zinc-950/70">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label} <span aria-hidden="true">· Markdown</span>
        </span>
        <div
          className="flex items-center gap-0.5 opacity-60 transition group-focus-within/markdown:opacity-100 group-hover/markdown:opacity-100"
          aria-label={`${label} formatting`}
        >
          <ToolbarButton
            label="Bold"
            active={editor?.isActive('bold')}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor?.isActive('italic')}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            active={editor?.isActive('strike')}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Inline code"
            active={editor?.isActive('code')}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label={editor?.isActive('link') ? 'Edit link' : 'Add link'}
            active={editor?.isActive('link')}
            disabled={!editor}
            onClick={editLink}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          {editor?.isActive('link') ? (
            <ToolbarButton
              label="Remove link"
              onClick={() =>
                editor.chain().focus().extendMarkRange('link').unsetLink().run()
              }
            >
              <Unlink2 className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
          ) : null}
          <span className="mx-1 h-4 border-l" aria-hidden="true" />
          <ToolbarButton
            label="Undo"
            disabled={!editor?.can().chain().focus().undo().run()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={!editor?.can().chain().focus().redo().run()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
        </div>
      </div>
      <EditorContent editor={editor} />
      <div className="border-t px-3 py-1 text-right text-[10px] text-muted-foreground">
        {characterCount}/{maxLength}
      </div>
    </div>
  )
}
