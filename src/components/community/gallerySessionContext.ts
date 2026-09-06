'use client'
import { createContext, useContext } from 'react'
export type Session = { isSignedIn: boolean; likedProjectIds: string[] }
export const SessionContext = createContext<{
  ready: boolean
  setSession: (session: Session) => void
} | null>(null)
export function useGallerySessionReady() {
  return useContext(SessionContext)?.ready ?? true
}
