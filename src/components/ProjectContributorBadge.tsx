import { Award } from 'lucide-react'
import { isProjectContributor } from '@/lib/projectContributors'
import { Badge } from '@/components/ui/badge'

export function ProjectContributorBadge({ username }: { username: string }) {
  if (!isProjectContributor(username)) return null

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:border-amber-300/25 dark:bg-amber-300/[0.07] dark:text-amber-200/80"
    >
      <Award aria-hidden="true" className="h-3.5 w-3.5" />
      Archive contributor
    </Badge>
  )
}
