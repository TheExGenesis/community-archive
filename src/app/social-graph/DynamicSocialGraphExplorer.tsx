'use client'

import dynamic from 'next/dynamic'

const SocialGraphExplorer = dynamic(() => import('./SocialGraphExplorer'), {
  ssr: false,
  loading: () => (
    <div className="h-[min(72vh,760px)] animate-pulse rounded-[4px] border border-zinc-200 bg-zinc-200/60 dark:border-[#26262a] dark:bg-[#151517]" />
  ),
})

export default SocialGraphExplorer
