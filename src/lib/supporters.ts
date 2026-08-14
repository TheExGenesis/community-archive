import 'server-only'
import type { Contributor } from '@/components/TieredSupportersDisplay'

interface OpenCollectiveMember {
  name?: unknown
  role?: unknown
  type?: unknown
  isActive?: unknown
  profile?: unknown
  image?: unknown
  slug?: unknown
  totalAmountDonated?: unknown
}

export async function getOpenCollectiveContributors(): Promise<Contributor[]> {
  try {
    const response = await fetch(
      'https://opencollective.com/community-archive/members/all.json',
      { next: { revalidate: 3600 } },
    )
    if (!response.ok) {
      console.error(`Failed to fetch Open Collective data: ${response.status}`)
      return []
    }

    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) return []

    return payload
      .flatMap((value): Contributor[] => {
        const member = value as OpenCollectiveMember
        const amount =
          typeof member.totalAmountDonated === 'number'
            ? member.totalAmountDonated
            : 0
        const eligibleRole =
          member.role === 'BACKER' || (member.role === 'MEMBER' && amount > 0)
        if (
          member.isActive !== true ||
          !eligibleRole ||
          typeof member.name !== 'string' ||
          typeof member.role !== 'string' ||
          typeof member.type !== 'string' ||
          typeof member.profile !== 'string'
        ) {
          return []
        }

        return [
          {
            name: member.name,
            role: member.role,
            type: member.type,
            isActive: true,
            profile: member.profile,
            image: typeof member.image === 'string' ? member.image : null,
            slug:
              typeof member.slug === 'string' ? member.slug : member.profile,
            totalAmountDonated: amount,
          },
        ]
      })
      .sort(
        (left, right) =>
          right.totalAmountDonated - left.totalAmountDonated ||
          left.name.localeCompare(right.name),
      )
  } catch (error) {
    console.error('Error fetching Open Collective contributors:', error)
    return []
  }
}
