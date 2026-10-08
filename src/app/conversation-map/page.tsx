import ConversationMap from '@/components/conversation-map/ConversationMap'

export const metadata = {
  title: 'Conversation Map · Community Archive',
  description:
    'The most important conversations on the Community Archive, at a glance. Zoom in for more granularity.',
}
export const dynamic = 'force-dynamic'

export default function ConversationMapPage() {
  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ConversationMap initialYear={new Date().getUTCFullYear()} />
    </main>
  )
}
