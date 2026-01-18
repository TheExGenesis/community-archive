'use client'

import Link from 'next/link'
import { FaEye, FaProjectDiagram, FaFire, FaExternalLinkAlt } from 'react-icons/fa'

interface FeaturedApp {
  name: string
  description: string
  link: string
  icon: React.ReactNode
  color: string
}

const featuredApps: FeaturedApp[] = [
  {
    name: "Bird's Eye",
    description: 'See your tweets by topic and over time',
    link: 'https://theexgenesis--community-archive-birdseye-run.modal.run/',
    icon: <FaEye className="w-8 h-8" />,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    name: 'Strand Atlas',
    description: 'Explore the best conversation threads',
    link: 'https://bangers.community-archive.org/detailed-strand-atlas',
    icon: <FaProjectDiagram className="w-8 h-8" />,
    color: 'from-purple-500 to-pink-500',
  },
  {
    name: 'Bangers',
    description: 'Browse the most impactful tweets',
    link: 'https://bangers.community-archive.org',
    icon: <FaFire className="w-8 h-8" />,
    color: 'from-orange-500 to-red-500',
  },
]

function FeaturedAppCard({ app }: { app: FeaturedApp }) {
  return (
    <Link
      href={app.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-200 dark:border-slate-700"
    >
      {/* Gradient header with icon */}
      <div className={`h-32 bg-gradient-to-br ${app.color} flex items-center justify-center text-white`}>
        {app.icon}
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
        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Get Started
        </h2>
        <p className="mt-3 text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto">
          Explore the archive with these tools
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {featuredApps.map((app) => (
          <FeaturedAppCard key={app.name} app={app} />
        ))}
      </div>
    </section>
  )
}
