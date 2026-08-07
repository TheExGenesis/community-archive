import { redirect } from 'next/navigation'

// Trends now lives on the Stream page.
export default function TrendsPage() {
  redirect('/stream#trends')
}
