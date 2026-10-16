import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth-utils'
import {
  listPublicApiKeys,
  PUBLIC_API_BASE_URL,
  type PublicApiKeySummary,
} from '@/lib/publicApiKeys'
import { ApiKeysManager } from './ApiKeysManager'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'API keys · Community Archive',
  robots: { index: false, follow: false },
}

export default async function ApiKeysPage() {
  const { user } = await requireAuth('/settings/api-keys')
  let initialKeys: PublicApiKeySummary[] = []
  let loadError: string | null = null
  try {
    initialKeys = await listPublicApiKeys(user.id)
  } catch {
    loadError = 'Your keys could not be loaded. Refresh to try again.'
  }

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="mb-2 text-sm text-muted-foreground">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>{' '}
          / API keys
        </p>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Use a key to read tweets, accounts, and archive members from your own
          servers and scripts. Keep keys secret: never put one in browser or app
          code. Create a separate key for each project so you can revoke one
          without breaking the others.
        </p>
        <ApiKeysManager
          initialKeys={initialKeys}
          initialError={loadError}
          baseUrl={PUBLIC_API_BASE_URL}
        />
      </div>
    </main>
  )
}
