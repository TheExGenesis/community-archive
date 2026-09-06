import ConversationMap from '@/components/conversation-map/ConversationMap'

export const metadata = {
  title: 'Conversation Map · Community Archive',
  description:
    'Explore a year of community conversations. Zoom to reveal tweet snippets, images, and source posts.',
}
export const dynamic = 'force-dynamic'

export default function ConversationMapPage() {
  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ConversationMap initialYear={new Date().getUTCFullYear()} />
    </main>
  )
}
