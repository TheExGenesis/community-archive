'use client'

import { capturePostHogEvent } from '@/lib/posthog'
import { useProfileEditing } from './ProfileEditingContext'

export function ProfileEditButton() {
  const { editing, editSaving, setEditing } = useProfileEditing()

  return (
    <button
      type="button"
      onClick={() => {
        if (!editing) capturePostHogEvent('profile_edit_started')
        setEditing((current) => !current)
      }}
      disabled={editSaving}
      className="rounded-full border border-brand/35 bg-brand/5 px-4 py-[7px] text-sm font-semibold text-brand transition-colors hover:border-brand/55 hover:bg-brand/10 disabled:opacity-60"
    >
      {editing ? 'Done editing' : 'Edit profile'}
    </button>
  )
}
