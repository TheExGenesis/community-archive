'use client'

import { useEffect, useRef, useState } from 'react'
import { Music } from 'lucide-react'

export function DigestJingleButton() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/audio/daily-digest-jingle.mp3')
      audioRef.current.addEventListener('ended', () => setPlaying(false))
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      void audioRef.current.play()
      setPlaying(true)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        playing ? 'Stop the Daily Digest jingle' : 'Play the Daily Digest jingle'
      }
      aria-pressed={playing}
      title="Play the Daily Digest jingle"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-brand transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-zinc-800"
    >
      <Music
        className={`h-5 w-5 ${playing ? 'animate-pulse' : ''}`}
        strokeWidth={2.25}
      />
    </button>
  )
}
