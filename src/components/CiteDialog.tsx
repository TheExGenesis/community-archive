'use client'

import Link from 'next/link'
import { Quote } from 'lucide-react'
import CitationBlocks from '@/app/cite/CitationBlocks'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { captureProductAction } from '@/lib/productAnalytics'

// Matches the header's top-level links (HeaderNavigation's topLevelStyle),
// but only from 1400px up: below that the header has no room left. Narrower screens reach /cite from the footer.
const triggerStyle =
  'hidden h-9 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-brand/5 hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 xl:px-2 min-[1400px]:inline-flex'

export default function CiteDialog() {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) captureProductAction('cite', 'citation_opened')
      }}
    >
      <DialogTrigger className={triggerStyle}>
        <Quote className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        Cite
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cite the archive</DialogTitle>
          <DialogDescription>
            The archive changes every day, so the citation includes
            today&apos;s date as the access date.
          </DialogDescription>
        </DialogHeader>
        <CitationBlocks order="bibtex-first" />
        <p className="text-sm text-muted-foreground">
          <DialogClose asChild>
            <Link className="underline" href="/cite">
              More on citing
            </Link>
          </DialogClose>
        </p>
      </DialogContent>
    </Dialog>
  )
}
