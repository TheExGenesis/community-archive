import React from 'react'
import Link from 'next/link'
import { FaGithub, FaDiscord } from 'react-icons/fa'
import {
  currentProjectContributors,
  pastProjectContributors,
} from '@/lib/projectContributors'
import { userProfileHref } from '@/lib/navigation'
import FundersThanks from '@/components/FundersThanks'

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const className = 'text-brand hover:underline'
  return href.startsWith('/') ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  )
}

export const metadata = {
  title: 'About · Community Archive',
  description:
    'Community Archive maps how ideas spread in online communities: an open archive of tweets people choose to share, tools built on it, and research into how ideas travel.',
}

export default function AboutPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-3 text-3xl font-bold">About Community Archive</h1>
      <p className="mb-6 text-xl text-muted-foreground">
        Mapping how ideas spread in online communities.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 mt-8 text-2xl font-semibold">What we do</h2>
        <p className="mb-4 text-muted-foreground">
          The Community Archive does three things.
        </p>
        <ol className="list-decimal space-y-5 pl-5 text-muted-foreground marker:font-semibold marker:text-foreground">
          <li>
            <strong className="text-foreground">
              It archives posts for posterity.
            </strong>{' '}
            27 million tweets from 2,400 accounts are open to everyone: from
            communities such as TPOT, rationality, effective altruism and AI
            Twitter, shared by the people who wrote them.
          </li>
          <li>
            <strong className="text-foreground">
              It powers tools for communities, epistemics and coordination.
            </strong>{' '}
            Our own include the <A href="/digest">daily</A> and{' '}
            <A href="/digest/week">weekly digests</A> and{' '}
            <A href="/search/ask">agentic search</A>. Dozens more are{' '}
            <A href="/community">built by the community</A>, such as{' '}
            <A href="https://modelbehavior.report/">Model Behavior Reports</A>{' '}
            and <A href="https://cuties.app/">Cuties</A>.
          </li>
          <li>
            <strong className="text-foreground">
              We research how ideas spread online.
            </strong>{' '}
            The <A href="/spread-explorer">spread explorer</A> shows an idea
            moving like weather across a map of Twitter, and our first report
            traces the phrase{' '}
            <A href="/research/you-can-just-do-things">
              &ldquo;you can just do things&rdquo;
            </A>{' '}
            from TPOT to tech to politics, a first step towards tracing the
            history of any idea. For research we also draw on a private dataset
            of more than 40 billion tweets from 180 million accounts, about 5%
            of all of Twitter, and with{' '}
            <A href="https://www.calcifercomputing.com/reports/tlm">
              Calcifer Computing
            </A>{' '}
            we have trained a 1-billion-parameter language model of where and
            when things are said.
          </li>
        </ol>
        <p className="mt-5 text-muted-foreground">
          We also help build the field of AI for epistemics. In 2025 we hosted
          the{' '}
          <A href="https://xiqo.substack.com/p/the-unconference-on-ai-for-collective">
            AI for Collective Sensemaking unconference
          </A>{' '}
          in New York, with about 100 attendees, and the{' '}
          <A href="https://xiqo.substack.com/p/the-community-archive-hackathon">
            Community Archive hackathon
          </A>
          , with more than 60 participants and 16 final submissions.
        </p>
        <p className="mt-4 text-muted-foreground">
          All of it runs on open-source, public infrastructure that{' '}
          <strong>collects, hosts, and serves</strong> data people choose to
          share, so that communities can use it for any purpose they choose.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          Current Contributors
        </h2>

        <div className="space-y-6">
          {currentProjectContributors.map((contributor) => (
            <div
              key={contributor.username}
              className="rounded-lg bg-muted p-4 dark:bg-card"
            >
              <h3 className="mb-1 text-xl font-semibold">
                <Link
                  href={userProfileHref(contributor.username)}
                  className="transition-colors hover:text-brand"
                >
                  {contributor.name}
                  {contributor.qualifier ? (
                    <span className="text-muted-foreground">
                      {' '}
                      ({contributor.qualifier})
                    </span>
                  ) : null}
                </Link>
              </h3>
              {contributor.role && (
                <p className="text-muted-foreground">{contributor.role}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-2 mt-8 text-2xl font-semibold">Past Contributors</h2>
        <p className="mb-4 text-muted-foreground">
          Past contributors whose work helped build Community Archive.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {pastProjectContributors.map((contributor) => (
            <div
              key={contributor.name}
              className="rounded-lg bg-muted p-4 dark:bg-card"
            >
              <h3 className="text-lg font-semibold">
                {contributor.username ? (
                  <Link
                    href={userProfileHref(contributor.username)}
                    className="transition-colors hover:text-brand"
                  >
                    {contributor.name}
                  </Link>
                ) : (
                  <a
                    href={contributor.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-brand"
                  >
                    {contributor.name}
                  </a>
                )}
              </h3>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-2 mt-8 text-2xl font-semibold">Funders and Thanks</h2>
        <p className="mb-4 text-muted-foreground">
          The archive exists because of the people who funded and housed it. Our
          community backers are on the <A href="/supporters">supporters page</A>
          .
        </p>
        <FundersThanks />
      </section>

      <section className="mb-12">
        <h2 className="mb-4 mt-8 text-2xl font-semibold">Get Involved</h2>
        <p className="mb-6 text-muted-foreground">
          Community Archive is open source and community-driven. Here&apos;s how
          you can participate:
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <a
            href="https://github.com/TheExGenesis/community-archive"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg bg-muted p-4 transition-colors hover:bg-accent dark:bg-card"
          >
            <FaGithub className="text-2xl" />
            <div>
              <div className="font-semibold">GitHub</div>
              <div className="text-sm text-muted-foreground">
                Contribute code
              </div>
            </div>
          </a>

          <a
            href="https://discord.gg/RArTGrUawX"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg bg-muted p-4 transition-colors hover:bg-accent dark:bg-card"
          >
            <FaDiscord className="text-2xl text-indigo-500" />
            <div>
              <div className="font-semibold">Discord</div>
              <div className="text-sm text-muted-foreground">
                Join the community
              </div>
            </div>
          </a>

          <a
            href="https://opencollective.com/community-archive/donate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg bg-muted p-4 transition-colors hover:bg-accent dark:bg-card"
          >
            <span className="text-2xl">💖</span>
            <div>
              <div className="font-semibold">Donate</div>
              <div className="text-sm text-muted-foreground">
                Support the project
              </div>
            </div>
          </a>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 mt-8 text-2xl font-semibold">Learn More</h2>
        <ul className="space-y-2">
          <li>
            <Link href="/data-policy" className="text-brand">
              Data Policy
            </Link>{' '}
            - How we handle your data
          </li>
          <li>
            <a
              href="https://github.com/TheExGenesis/community-archive/tree/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand"
            >
              Documentation
            </a>{' '}
            - API docs and examples
          </li>
        </ul>
      </section>
    </div>
  )
}
