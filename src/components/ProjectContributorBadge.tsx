import { Award } from 'lucide-react'
import { isProjectContributor } from '@/lib/projectContributors'
import { Badge } from '@/components/ui/badge'

export function ProjectContributorBadge({ username }: { username: string }) {
  if (!isProjectContributor(username)) return null

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-brand/40 bg-brand/10 text-brand"
    >
      <Award aria-hidden="true" className="h-3.5 w-3.5" />
      Archive contributor
    </Badge>
  )
}
