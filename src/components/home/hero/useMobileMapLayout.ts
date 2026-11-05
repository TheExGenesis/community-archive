'use client'
import { useSyncExternalStore } from 'react'

const query = '(max-width: 979px)'
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const getSnapshot = () => window.matchMedia(query).matches
const getServerSnapshot = () => false

export default function useMobileMapLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
