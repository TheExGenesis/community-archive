'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      className={className}
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw
        className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      {pending ? 'Refreshing…' : 'Refresh'}
    </Button>
  )
}
