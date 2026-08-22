import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Bot, Braces, Database } from 'lucide-react'

const API_URL = 'https://fabxmporizzqflnftavs.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8'
export const metadata: Metadata = {
  title: 'Docs | Community Archive',
  description:
    'Documentation for the Community Archive API, bulk data dump, and agent resources.',
}

const curlExample = `export CA_API_URL='${API_URL}'
export CA_ANON_KEY='${ANON_KEY}'

curl --get "$CA_API_URL/rest/v1/enriched_tweets" \\
  -H "apikey: $CA_ANON_KEY" \\
  -H "Authorization: Bearer $CA_ANON_KEY" \\
  --data-urlencode "select=tweet_id,username,created_at,full_text" \\
  --data-urlencode "username=ilike.defenderofbasic" \\
  --data-urlencode "order=created_at.desc" \\
  --data-urlencode "limit=5"`

const javascriptExample = `import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  '${API_URL}',
  process.env.CA_ANON_KEY,
)

const { data, error } = await supabase
  .from('enriched_tweets')
  .select('tweet_id, username, created_at, full_text')
  .ilike('username', 'defenderofbasic')
  .order('created_at', { ascending: false })
  .limit(5)

if (error) throw error
console.log(data)`

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-sm leading-6 text-foreground">
      <code>{children}</code>
    </pre>
  )
}

function ResourceLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const isExternal = href.startsWith('http')

  return (
    <Link
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="inline-flex items-center gap-1 font-medium text-brand"
    >
      {children}
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  )
}

export default function DocsPage() {
  return (
    <main className="bg-background">
      <section className="border-b border-border bg-card dark:bg-background">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm text-muted-foreground">
              <Bot className="h-4 w-4" aria-hidden="true" />
              Agent-friendly documentation
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              Build with the archive
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Query policy-filtered public records through the API or give an
              agent one canonical starting point.
            </p>
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-5">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Point an agent here
              </p>
              <ResourceLink href="/llms.txt">
                https://www.community-archive.org/llms.txt
              </ResourceLink>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This plain-text index includes the data dump, API credentials,
                query examples, schema notes, and deeper documentation links.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-16 px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <section className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground">
              Choose an access path
            </h2>
            <p className="mt-2 text-muted-foreground">
              Choose the policy-safe surface that fits your query.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-border bg-card p-6">
              <Database className="h-6 w-6 text-brand" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Bulk export paused
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The historical Parquet pipeline is private while it is rebuilt
                to enforce current consent for every nested author.
              </p>
            </article>

            <article className="rounded-lg border border-border bg-card p-6">
              <Braces className="h-6 w-6 text-brand" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Live API
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use the read-only Supabase REST API for filtered, paginated
                requests and application features.
              </p>
              <div className="mt-4 flex flex-col items-start gap-2">
                <ResourceLink href="/api/reference">
                  Interactive reference
                </ResourceLink>
                <ResourceLink href="/openapi.json">OpenAPI JSON</ResourceLink>
              </div>
            </article>

            <article className="rounded-lg border border-border bg-card p-6">
              <Database className="h-6 w-6 text-brand" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                One raw archive
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Signed-in owners can download their own processed archive JSON
                while current PostgreSQL policy permits it.
              </p>
              <p className="mt-4 break-all font-mono text-xs leading-5 text-muted-foreground">
                {API_URL}
                https://www.community-archive.org/api/archive/&lt;username&gt;
              </p>
            </article>
          </div>
        </section>

        <section className="space-y-6" id="bulk-dump">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-foreground">
              Bulk export paused
            </h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              The former <code>enriched_tweets.parquet</code> artifact was not
              able to apply current consent to every nested author immediately
              before publication. It is no longer public. Use filtered API
              requests until a policy-aware replacement is available.
            </p>
          </div>
        </section>

        <section className="space-y-8" id="api">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-foreground">
              API quickstart
            </h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              The API is PostgREST served by Supabase. Send the public anon key
              in both the <code>apikey</code> and <code>Authorization</code>
              headers. The anon key is intentionally public; never use a
              service-role key in client code.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">cURL</h3>
            <CodeBlock>{curlExample}</CodeBlock>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              JavaScript
            </h3>
            <CodeBlock>{javascriptExample}</CodeBlock>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground">
                Useful resources
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <code>enriched_tweets</code> — joined tweet and account data
                </li>
                <li>
                  <code>tweets</code> — core tweet records
                </li>
                <li>
                  <code>all_account</code> — accounts and usernames
                </li>
                <li>
                  <code>all_profile</code> — bios and profile media
                </li>
                <li>
                  <code>user_directory</code> — directory-ready account data
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground">Query rules</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>
                  Username casing is preserved; use <code>ilike</code> when the
                  original casing is unknown.
                </li>
                <li>Treat Twitter IDs as strings, not numbers.</li>
                <li>
                  Request only the columns you need with <code>select</code>.
                </li>
                <li>
                  Paginate large results; responses are capped at 1,000 rows.
                </li>
                <li>
                  Use a stable <code>order</code> when paging through changing
                  data.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Deeper docs</h2>
            <p className="mt-2 text-muted-foreground">
              The repository contains schema guidance and complete examples.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ResourceLink href="https://github.com/TheExGenesis/community-archive/blob/main/docs/agents.md">
              Agent and schema guide
            </ResourceLink>
            <ResourceLink href="https://github.com/TheExGenesis/community-archive/blob/main/docs/api-doc.md">
              API guide
            </ResourceLink>
            <ResourceLink href="https://github.com/TheExGenesis/community-archive/tree/main/docs/examples">
              Python examples and notebook
            </ResourceLink>
            <ResourceLink href="https://github.com/TheExGenesis/community-archive/blob/main/docs/archive_data.md">
              Raw archive structure
            </ResourceLink>
          </div>
        </section>
      </div>
    </main>
  )
}
