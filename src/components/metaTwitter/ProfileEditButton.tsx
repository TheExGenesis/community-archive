'use client'

import { useProfileEditing } from './ProfileEditingContext'

export function ProfileEditButton() {
  const { editing, editSaving, setEditing } = useProfileEditing()

  return (
    <button
      type="button"
      onClick={() => setEditing((current) => !current)}
      disabled={editSaving}
      className="border-brand/35 hover:border-brand/55 rounded-full border bg-brand/5 px-4 py-[7px] text-sm font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-60"
    >
      {editing ? 'Done editing' : 'Edit profile'}
    </button>
  )
}
