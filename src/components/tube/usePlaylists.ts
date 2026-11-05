'use client'

import { useEffect, useState } from 'react'

export interface TubePlaylist {
  id: string
  title: string
  blurb: string
  section: string
  ids: string[]
}

let cache: Promise<TubePlaylist[]> | null = null

/** Playlists ship as one static file built by scripts/tube/build-tube-data.py. */
export function usePlaylists(): TubePlaylist[] | null {
  const [lists, setLists] = useState<TubePlaylist[] | null>(null)
  useEffect(() => {
    cache ??= fetch('/tube/playlists.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
    let live = true
    cache.then((l) => live && setLists(l))
    return () => {
      live = false
    }
  }, [])
  return lists
}
