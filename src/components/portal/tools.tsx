import {
  FaFire,
  FaHistory,
  FaPoll,
  FaProjectDiagram,
  FaRobot,
  FaSearchPlus,
  FaUsers,
  FaWrench,
} from 'react-icons/fa'

export interface PortalTool {
  slug: string
  name: string
  description: string
  link: string
  icon: React.ReactNode
  /** Preview image; featured tools render as larger image cards. */
  image?: string
}

/** Tools and projects built on the archive. Shown on the member Home panel
 *  and the /tools page; mirrors the classic homepage's featured apps lists. */
export const PORTAL_TOOLS: PortalTool[] = [
  {
    slug: 'strands',
    name: 'Best Strands',
    description: 'Explore the archive’s best conversation strands',
    link: 'https://bangers.community-archive.org/best-strands',
    icon: <FaProjectDiagram />,
    image: '/images/featured/strand-atlas.png',
  },
  {
    slug: 'bangers',
    name: 'Bangers',
    description: 'Browse the most impactful tweets',
    link: 'https://bangers.community-archive.org',
    icon: <FaFire />,
    image: '/images/featured/bangers.png',
  },
  {
    slug: 'archive-trends',
    name: 'Archive Trends',
    description: 'Keyword trends like Google Trends',
    link: 'https://labs-community-archive.streamlit.app/',
    icon: <FaPoll />,
  },
  {
    slug: 'archive-toolkit',
    name: 'Archive Toolkit',
    description: 'Chronological thread viewer',
    link: 'https://github.com/DefenderOfBasic/twitter-archive-toolkit',
    icon: <FaWrench />,
  },
  {
    slug: 'archive-semantic-search',
    name: 'Semantic Search',
    description: 'Search archives by meaning',
    link: 'https://github.com/DefenderOfBasic/twitter-semantic-search',
    icon: <FaSearchPlus />,
  },
  {
    slug: 'banger-bot',
    name: 'Banger Bot',
    description: 'AI tweets from top content',
    link: 'https://theexgenesis--text-rag-ui-run.modal.run/',
    icon: <FaRobot />,
  },
  {
    slug: 'highlights-bot',
    name: 'Highlights Bot',
    description: 'Daily historical highlights',
    link: 'https://www.val.town/v/exgenesis/ca_highlights',
    icon: <FaHistory />,
  },
  {
    slug: 'community-builds',
    name: 'Community Builds',
    description: 'More projects from the community',
    link: '/tweets/1835411943735140798',
    icon: <FaUsers />,
  },
]
