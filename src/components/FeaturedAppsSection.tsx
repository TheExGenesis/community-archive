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
    icon: <FaProjectDiagram className="w-8 h-8" />,
    color: 'from-purple-500 to-pink-500',
    image: '/images/featured/strand-atlas.png',
  },
  {
    name: 'Bangers',
    description: 'Browse the most impactful tweets',
    link: 'https://bangers.community-archive.org',
    icon: <FaFire className="w-8 h-8" />,
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
      className="group flex flex-col bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-200 dark:border-slate-700"
    >
      {/* Thumbnail header — gradient + icon stay behind as a fallback if the image is missing */}
      <div className={`relative h-40 bg-gradient-to-br ${app.color} flex items-center justify-center text-white`}>
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
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          {app.name}
          <FaExternalLinkAlt className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm flex-1">
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
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Explore the archive
        </h2>
        <p className="mt-3 text-base text-gray-600 dark:text-gray-300 max-w-xl mx-auto">
          Browse the evolution of Twitter narratives, ideas, memes, and stories that shape our culture today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {featuredApps.map((app) => (
          <FeaturedAppCard key={app.name} app={app} />
        ))}
      </div>
    </section>
  )
}
