'use client'

import { Button } from '@/components/ui/button'
import { useCommunityOptIn } from '@/components/CommunityOptIn'
import { Users, Upload } from 'lucide-react'
import { capturePostHogEvent } from '@/lib/posthog'

export default function HeroCTAButtons({
  initialIsOptedIn = false,
}: {
  initialIsOptedIn?: boolean
}) {
  const optIn = useCommunityOptIn()
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
        {!initialIsOptedIn && !optIn.completed && (
          <Button
            onClick={() => {
              capturePostHogEvent('homepage_action_clicked', {
                action: 'opt_in',
              })
              optIn.open()
            }}
            disabled={optIn.busy}
            className="h-14 w-full bg-brand px-8 text-lg font-semibold text-brand-foreground hover:bg-brand/90"
            size="lg"
          >
            <Users className="mr-2 h-5 w-5" />
            Opt in
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="h-14 w-full border-2 px-8 text-lg font-semibold"
          size="lg"
        >
          <a href="#upload-archive">
            <Upload className="mr-2 h-5 w-5" />
            Upload archive
          </a>
        </Button>
      </div>
      {optIn.error && <p role="alert">{optIn.error}</p>}
    </div>
  )
}
