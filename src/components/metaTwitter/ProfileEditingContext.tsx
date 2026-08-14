'use client'

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useMemo,
  useState,
} from 'react'

interface ProfileEditingState {
  editing: boolean
  editSaving: boolean
  setEditing: Dispatch<SetStateAction<boolean>>
  setEditSaving: Dispatch<SetStateAction<boolean>>
}

const ProfileEditingContext = createContext<ProfileEditingState | null>(null)

export function ProfileEditingProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const value = useMemo(
    () => ({ editing, editSaving, setEditing, setEditSaving }),
    [editing, editSaving],
  )

  return (
    <ProfileEditingContext.Provider value={value}>
      {children}
    </ProfileEditingContext.Provider>
  )
}

export function useProfileEditing() {
  const context = useContext(ProfileEditingContext)
  if (!context) {
    throw new Error(
      'useProfileEditing must be used within a ProfileEditingProvider',
    )
  }
  return context
}
