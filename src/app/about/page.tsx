import React from 'react'
import Link from 'next/link'
import { FaTwitter, FaGithub, FaDiscord } from 'react-icons/fa'

export default function AboutPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">About Community Archive</h1>

      <section className="mb-12">
        <h2 className="mb-4 mt-8 text-2xl font-semibold">Our Mission</h2>
        <p className="mb-4 text-lg text-muted-foreground">
          We believe in the immense cultural, historical, and economic value
          embedded in our collective digital data.
        </p>
        <p className="mb-4 text-muted-foreground">
          Our goal is to build open-source, public infrastructure to{' '}
          <strong>collect, host, and serve</strong> this data, empowering
          communities to use it for any purpose they choose.
        </p>
        <p className="text-muted-foreground">
          Twitter conversations represent a unique record of how ideas spread,
          communities form, and culture evolves. By preserving this data openly,
          we enable researchers, developers, and communities to learn from and
          build upon this shared history.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 mt-8 text-2xl font-semibold">The Team</h2>

        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-lg bg-muted p-4 dark:bg-card">
            <div className="flex-1">
              <h3 className="mb-1 text-xl font-semibold">
                <a
                  href="https://x.com/exgenesis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-brand"
                >
                  @exgenesis
                </a>
              </h3>
              <p className="text-muted-foreground">Creator & Lead</p>
            </div>
            <a
              href="https://x.com/exgenesis"
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xl text-muted-foreground transition-colors hover:text-brand"
            >
              <FaTwitter />
            </a>
          </div>

          <div className="flex items-start gap-4 rounded-lg bg-muted p-4 dark:bg-card">
            <div className="flex-1">
              <h3 className="mb-1 text-xl font-semibold">
                <a
                  href="https://x.com/IaimforGOAT"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-brand"
                >
                  @IaimforGOAT
                </a>
              </h3>
              <p className="text-muted-foreground">Core Contributor</p>
            </div>
            <a
              href="https://x.com/IaimforGOAT"
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xl text-muted-foreground transition-colors hover:text-brand"
            >
              <FaTwitter />
            </a>
          </div>
        </div>
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
            <Link href="/data-policy" className="text-brand hover:underline">
              Data Policy
            </Link>{' '}
            - How we handle your data
          </li>
          <li>
            <a
              href="https://github.com/TheExGenesis/community-archive/tree/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
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
