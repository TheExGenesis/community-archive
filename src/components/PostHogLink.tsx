'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { capturePostHogEvent } from '@/lib/posthog'

type PostHogLinkProps = ComponentProps<typeof Link> & {
  eventName: string
  eventProperties?: Record<string, unknown>
}

export default function PostHogLink({
  eventName,
  eventProperties,
  onClick,
  ...props
}: PostHogLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        capturePostHogEvent(eventName, eventProperties)
        onClick?.(event)
      }}
    />
  )
}
