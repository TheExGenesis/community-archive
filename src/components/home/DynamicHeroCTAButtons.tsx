'use client'

import dynamic from 'next/dynamic'

const DynamicHeroCTAButtons = dynamic(
  () => import('@/components/HeroCTAButtons'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted sm:h-10 sm:w-36" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted sm:h-10 sm:w-36" />
      </div>
    ),
  },
)

export default DynamicHeroCTAButtons
