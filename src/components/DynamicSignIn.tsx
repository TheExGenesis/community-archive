'use client'

import dynamic from 'next/dynamic'

const DynamicSignIn = dynamic(() => import('@/components/SignIn'), {
  ssr: false,
})

export default DynamicSignIn
