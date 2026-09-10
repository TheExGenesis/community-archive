import { Figtree, Source_Serif_4 } from 'next/font/google'

export const uiFont = Figtree({
  subsets: ['latin'],
  variable: '--bulletin-ui',
  display: 'swap',
})
export const displayFont = Source_Serif_4({
  subsets: ['latin'],
  variable: '--bulletin-display',
  display: 'swap',
})
