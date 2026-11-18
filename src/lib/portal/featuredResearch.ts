import type { ResearchPost } from './types'

// Our own research piece, published as a page on this site. The Research
// listing and the homepage card both link to it.
export const YOU_CAN_JUST_DO_THINGS: ResearchPost = {
  title: 'You can just do things',
  url: '/research/you-can-just-do-things',
  date: '2026-11-11T12:00:00.000Z',
  excerpt:
    'How one phrase spread from TPOT to tech to politics, traced through 17,657 tweets.',
  image: '/images/research/you-can-just-do-things.png',
  imageLight: '/images/research/you-can-just-do-things-light.png',
  author: 'Community Archive',
}

// Haoxing Du's study of lab alignment scores against misbehavior reports in
// archived tweets. It has no standalone page yet, so it links to the post.
export const ALIGNMENT_BENCHMARKS_VS_TWITTER: ResearchPost = {
  title: 'Alignment benchmarks vs. Twitter reports',
  url: 'https://x.com/haoxingdu/status/2122837542336913913',
  date: '2026-11-17T23:41:25.000Z',
  excerpt:
    'Do labs’ alignment scores match how models misbehave in the wild? Misbehavior reports in Community Archive tweets barely track the system-card rankings across 14 models.',
  image: '/images/research/alignment-benchmarks-vs-twitter.webp',
  author: 'Haoxing Du',
}

/** Quick, purposeful investigations, listed under Journal on the Research page. */
export const JOURNAL_POSTS: ResearchPost[] = [
  YOU_CAN_JUST_DO_THINGS,
  ALIGNMENT_BENCHMARKS_VS_TWITTER,
]
