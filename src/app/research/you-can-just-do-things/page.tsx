import type { Metadata } from 'next'
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Instrument_Sans,
} from 'next/font/google'
import ArticleScript from './ArticleScript'
import { ARTICLE_HTML } from './content'
import './article.css'

// The whole piece is built ahead of time: no request renders a function or
// reads a database. Only the optional search box calls the API, for members.
export const dynamic = 'force-static'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-ycjdt-display',
  display: 'swap',
})
const body = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-ycjdt-body',
  display: 'swap',
})
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ycjdt-mono',
  display: 'swap',
})

const TITLE = 'You can just do things'
const DESCRIPTION =
  'How one phrase spread from TPOT to tech to politics, traced through 17,657 tweets.'
const IMAGE = {
  url: '/images/research/you-can-just-do-things.png',
  width: 1200,
  height: 630,
}

export const metadata: Metadata = {
  title: 'You Can Just Do Things · Community Archive Research',
  description: DESCRIPTION,
  alternates: { canonical: '/research/you-can-just-do-things' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'article',
    url: '/research/you-can-just-do-things',
    siteName: 'Community Archive',
    images: [IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [IMAGE.url],
  },
}

export default function YouCanJustDoThingsPage() {
  return (
    <>
      <main
        className={`ycjdt ${display.variable} ${body.variable} ${mono.variable}`}
        dangerouslySetInnerHTML={{ __html: ARTICLE_HTML }}
      />
      <ArticleScript />
    </>
  )
}
