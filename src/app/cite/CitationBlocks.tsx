'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ACCESS_DATE_PLACEHOLDER,
  bibtexCitation,
  plainCitation,
} from '@/lib/citation'
import { captureProductAction } from '@/lib/productAnalytics'

function CitationBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      captureProductAction('cite', 'citation_copied')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy citation: ', err)
    }
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{label}</h2>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-4 text-sm">
        {text}
      </pre>
    </section>
  )
}

export default function CitationBlocks() {
  // The page is static, so today's date is filled in by the browser after
  // load; until then the citation shows a placeholder.
  const [accessDate, setAccessDate] = useState(ACCESS_DATE_PLACEHOLDER)
  useEffect(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    setAccessDate(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    )
  }, [])

  return (
    <>
      <CitationBlock label="Plain text" text={plainCitation(accessDate)} />
      <CitationBlock label="BibTeX" text={bibtexCitation(accessDate)} />
    </>
  )
}
