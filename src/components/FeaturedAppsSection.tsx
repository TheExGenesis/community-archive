'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { FaProjectDiagram, FaFire, FaExternalLinkAlt } from 'react-icons/fa'

interface FeaturedApp {
  name: string
  description: string
  link: string
  icon: React.ReactNode
  color: string
  image?: string
}

const featuredApps: FeaturedApp[] = [
  {
    name: 'Strand Atlas',
    description: 'Explore the best conversation threads',
    link: 'https://bangers.community-archive.org/detailed-strand-atlas',
    icon: <FaProjectDiagram className="h-8 w-8" />,
    color: 'from-purple-500 to-pink-500',
    image: '/images/featured/strand-atlas.png',
  },
  {
    name: 'Bangers',
    description: 'Browse the most impactful tweets',
    link: 'https://bangers.community-archive.org',
    icon: <FaFire className="h-8 w-8" />,
    color: 'from-orange-500 to-red-500',
    image: '/images/featured/bangers.png',
  },
]

function FeaturedAppCard({ app }: { app: FeaturedApp }) {
  // Track image load failures so a missing thumbnail cleanly falls back to the
  // gradient + icon. We also check on mount via the ref because the <img> can
  // error before React hydrates and attaches onError (SSR hydration race).
  const [imageOk, setImageOk] = useState(Boolean(app.image))

  return (
    <Link
      href={app.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-lg"
    >
      {/* Thumbnail header — gradient + icon stay behind as a fallback if the image is missing */}
      <div
        className={`relative h-40 bg-gradient-to-br ${app.color} flex items-center justify-center text-white`}
      >
        {app.icon}
        {app.image && imageOk && (
          <Image
            src={app.image}
            alt={`${app.name} preview`}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            onError={() => setImageOk(false)}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="mb-2 flex items-center gap-2 text-xl font-semibold text-foreground">
          {app.name}
          <FaExternalLinkAlt className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </h3>
        <p className="flex-1 text-sm text-muted-foreground">
          {app.description}
        </p>
      </div>
    </Link>
  )
}

export default function FeaturedAppsSection() {
  return (
    <section className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground">
          Explore the archive
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
          Browse the evolution of Twitter narratives, ideas, memes, and stories
          that shape our culture today.
        </p>
      </div>

      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
        {featuredApps.map((app) => (
          <FeaturedAppCard key={app.name} app={app} />
        ))}
      </div>
    </section>
  )
}
