'use client' // May not be strictly necessary if all data is passed as props, but good for consistency with other components

import Link from 'next/link'
import {
  FaPoll, // For Archive Trends (trends, analytics)
  FaWrench, // For Twitter Archive Toolkit (tool, utility)
  FaSearchPlus, // For Personal Semantic Search (search, discovery)
  FaRobot, // For Banger Bot (AI, automation)
  FaEye, // For Birdseye (overview, analysis)
  FaUsers, // For Thread of community builds (community, multiple items)
  FaHistory, // For Historical highlights bot (history, time)
  FaExternalLinkAlt, // Fallback or for generic links
} from 'react-icons/fa'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel" // Import new carousel components

interface AppItem {
  icon: React.ReactElement
  name: string
  description: string
  link: string
}

// Data manually created based on docs/apps.md
const appsData: AppItem[] = [
  {
    icon: <FaPoll />,
    name: 'Archive Trends',
    description: 'Keyword trends app like Google Trends.',
    link: 'https://labs-community-archive.streamlit.app/',
  },
  {
    icon: <FaWrench />,
    name: 'Twitter Archive Toolkit',
    description: 'Chronological viewer for threads.',
    link: 'https://github.com/DefenderOfBasic/twitter-archive-toolkit',
  },
  {
    icon: <FaSearchPlus />,
    name: 'Personal Semantic Search',
    description: 'Search individual archives semantically.',
    link: 'https://github.com/DefenderOfBasic/twitter-semantic-search',
  },
  {
    icon: <FaRobot />,
    name: 'Banger Bot',
    description: 'Write tweets based on RAG from the most liked tweets in the archive.',
    link: 'https://theexgenesis--text-rag-ui-run.modal.run/',
  },
  {
    icon: <FaEye />,
    name: 'Birdseye',
    description: 'Top down view of your tweets by topic and over time, with LLM analysis.',
    link: 'https://theexgenesis--community-archive-birdseye-run.modal.run/?username=romeostevens76',
  },
  {
    icon: <FaUsers />,
    name: 'Thread of Community Builds',
    description: 'Mostly smaller builds and demos from the community.',
    link: 'https://x.com/exgenesis/status/1835411943735140798',
  },
  {
    icon: <FaHistory />,
    name: 'Historical Highlights Bot',
    description: 'Posts highlights from the current day from past years (@ca_highlights).',
    link: 'https://www.val.town/v/exgenesis/ca_highlights',
  },
]

const AppCard: React.FC<AppItem> = ({ icon, name, description, link }) => (
  <Link href={link} passHref legacyBehavior>
    <a target="_blank" rel="noopener noreferrer" className="flex flex-col items-center p-6 bg-slate-100 dark:bg-slate-800 bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-700 dark:to-slate-800 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 h-full cursor-pointer">
      <div className="text-4xl mb-4 text-blue-500 dark:text-blue-400">{icon}</div>
      <h3 className="text-xl font-semibold mb-2 text-center text-gray-800 dark:text-gray-200">{name}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center flex-grow">{description}</p>
      <div className="mt-4 flex items-center text-xs text-gray-500 dark:text-gray-400">
        View App <FaExternalLinkAlt className="ml-1.5" />
      </div>
    </a>
  </Link>
)

export default function ShowcasedApps() {
  if (!appsData || appsData.length === 0) {
    return null // Or a placeholder if preferred
  }

  return (
    <section className="space-y-8 w-full">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Built with the Archive</h2>
        <p className="mt-3 text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto">
          Explore apps and tools developed by the community using this open data.
        </p>
      </div>
      <Carousel
        opts={{
          align: "start",
          loop: true,
        }}
        className="w-full max-w-xs sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto"
      >
        <CarouselContent className="-ml-1">
          {appsData.map((app, index) => (
            <CarouselItem key={index} className="pl-1 basis-full md:basis-1/2 lg:basis-1/3">
              <div className="p-1 h-full">
                <AppCard {...app} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="ml-[-10px] sm:ml-[-20px] md:ml-2 lg:ml-4 xl:ml-6"/>
        <CarouselNext className="mr-[-10px] sm:mr-[-20px] md:mr-2 lg:mr-4 xl:mr-6"/>
      </Carousel>
    </section>
  )
} 