'use client'

import Link from 'next/link'
import { forwardRef, type ComponentProps } from 'react'
import { capturePostHogEvent, type PostHogEventName } from '@/lib/posthog'

type PostHogLinkProps = ComponentProps<typeof Link> & {
  eventName: PostHogEventName
  eventProperties?: Record<string, unknown>
}

const PostHogLink = forwardRef<HTMLAnchorElement, PostHogLinkProps>(
  function PostHogLink(
    { eventName, eventProperties, onClick, onAuxClick, ...props },
    ref,
  ) {
    return (
      <Link
        {...props}
        ref={ref}
        onAuxClick={(event) => {
          if (event.button === 1)
            capturePostHogEvent(eventName, eventProperties)
          onAuxClick?.(event)
        }}
        onClick={(event) => {
          capturePostHogEvent(eventName, eventProperties)
          onClick?.(event)
        }}
      />
    )
  },
)

export default PostHogLink
