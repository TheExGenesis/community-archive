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
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex-shrink-0 text-2xl text-brand">{app.icon}</div>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          {app.name}
          <FaExternalLinkAlt className="h-2.5 w-2.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        </h3>
        <p className="truncate text-sm text-muted-foreground">
          {app.description}
        </p>
      </div>
    </Link>
  )
}

export default function AppGallery() {
  return (
    <div className="mt-8">
      <h3 className="mb-4 text-center text-lg font-medium text-muted-foreground">
        More Tools & Projects
      </h3>
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {galleryApps.map((app) => (
          <GalleryAppCard key={app.name} app={app} />
        ))}
      </div>
    </div>
  )
}
