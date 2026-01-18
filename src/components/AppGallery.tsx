'use client'

import Link from 'next/link'
import {
  FaPoll,
  FaWrench,
  FaSearchPlus,
  FaRobot,
  FaUsers,
  FaHistory,
  FaExternalLinkAlt,
} from 'react-icons/fa'

interface GalleryApp {
  icon: React.ReactElement
  name: string
  description: string
  link: string
}

const galleryApps: GalleryApp[] = [
  {
    icon: <FaPoll />,
    name: 'Archive Trends',
    description: 'Keyword trends like Google Trends',
    link: 'https://labs-community-archive.streamlit.app/',
  },
  {
    icon: <FaWrench />,
    name: 'Archive Toolkit',
    description: 'Chronological thread viewer',
    link: 'https://github.com/DefenderOfBasic/twitter-archive-toolkit',
  },
  {
    icon: <FaSearchPlus />,
    name: 'Semantic Search',
    description: 'Search archives by meaning',
    link: 'https://github.com/DefenderOfBasic/twitter-semantic-search',
  },
  {
    icon: <FaRobot />,
    name: 'Banger Bot',
    description: 'AI tweets from top content',
    link: 'https://theexgenesis--text-rag-ui-run.modal.run/',
  },
  {
    icon: <FaHistory />,
    name: 'Highlights Bot',
    description: 'Daily historical highlights',
    link: 'https://www.val.town/v/exgenesis/ca_highlights',
  },
  {
    icon: <FaUsers />,
    name: 'Community Builds',
    description: 'More projects from the community',
    link: 'https://x.com/exgenesis/status/1835411943735140798',
  },
]

function GalleryAppCard({ app }: { app: GalleryApp }) {
  return (
    <Link
      href={app.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700"
    >
      <div className="text-2xl text-blue-500 dark:text-blue-400 flex-shrink-0">
        {app.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          {app.name}
          <FaExternalLinkAlt className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
          {app.description}
        </p>
      </div>
    </Link>
  )
}

export default function AppGallery() {
  return (
    <div className="mt-8">
      <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4 text-center">
        More Tools & Projects
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {galleryApps.map((app) => (
          <GalleryAppCard key={app.name} app={app} />
        ))}
      </div>
    </div>
  )
}
