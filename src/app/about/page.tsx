import React from 'react'
import Link from 'next/link'
import { FaTwitter, FaGithub, FaDiscord } from 'react-icons/fa'

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="mb-6 text-3xl font-bold">About Community Archive</h1>

      <section className="mb-12">
        <h2 className="mt-8 mb-4 text-2xl font-semibold">Our Mission</h2>
        <p className="mb-4 text-lg text-gray-700 dark:text-gray-300">
          We believe in the immense cultural, historical, and economic value embedded in our collective digital data.
        </p>
        <p className="mb-4 text-gray-700 dark:text-gray-300">
          Our goal is to build open-source, public infrastructure to <strong>collect, host, and serve</strong> this data,
          empowering communities to use it for any purpose they choose.
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Twitter conversations represent a unique record of how ideas spread, communities form, and culture evolves.
          By preserving this data openly, we enable researchers, developers, and communities to learn from and build upon
          this shared history.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mt-8 mb-4 text-2xl font-semibold">The Team</h2>

        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-1">
                <a
                  href="https://x.com/exgenesis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-500 transition-colors"
                >
                  @exgenesis
                </a>
              </h3>
              <p className="text-gray-600 dark:text-gray-400">Creator & Lead</p>
            </div>
            <a
              href="https://x.com/exgenesis"
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xl text-gray-500 hover:text-blue-500 transition-colors"
            >
              <FaTwitter />
            </a>
          </div>

          <div className="flex items-start gap-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-1">
                <a
                  href="https://x.com/IaimforGOAT"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-500 transition-colors"
                >
                  @IaimforGOAT
                </a>
              </h3>
              <p className="text-gray-600 dark:text-gray-400">Core Contributor</p>
            </div>
            <a
              href="https://x.com/IaimforGOAT"
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xl text-gray-500 hover:text-blue-500 transition-colors"
            >
              <FaTwitter />
            </a>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mt-8 mb-4 text-2xl font-semibold">Get Involved</h2>
        <p className="mb-6 text-gray-700 dark:text-gray-300">
          Community Archive is open source and community-driven. Here&apos;s how you can participate:
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <a
            href="https://github.com/TheExGenesis/community-archive"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <FaGithub className="text-2xl" />
            <div>
              <div className="font-semibold">GitHub</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Contribute code</div>
            </div>
          </a>

          <a
            href="https://discord.gg/RArTGrUawX"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <FaDiscord className="text-2xl text-indigo-500" />
            <div>
              <div className="font-semibold">Discord</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Join the community</div>
            </div>
          </a>

          <a
            href="https://opencollective.com/community-archive/donate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="text-2xl">💖</span>
            <div>
              <div className="font-semibold">Donate</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Support the project</div>
            </div>
          </a>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mt-8 mb-4 text-2xl font-semibold">Learn More</h2>
        <ul className="space-y-2">
          <li>
            <Link href="/data-policy" className="text-blue-500 hover:underline">
              Data Policy
            </Link>
            {' '}- How we handle your data
          </li>
          <li>
            <a
              href="https://github.com/TheExGenesis/community-archive/tree/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              Documentation
            </a>
            {' '}- API docs and examples
          </li>
        </ul>
      </section>
    </div>
  )
}
