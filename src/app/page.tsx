import { redirect } from 'next/navigation'
import { Section } from "@/components/ui/section"
import CommunityStats from "@/components/CommunityStats"

export default function HomePage() {
  return (
    <main>
      <Section size="medium">
        <CommunityStats />
      </Section>
      {/* Other sections */}
    </main>
  )
}
