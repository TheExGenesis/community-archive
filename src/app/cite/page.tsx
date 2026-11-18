import Link from 'next/link'
import CitationBlocks from './CitationBlocks'

export const metadata = {
  title: 'Cite the archive · Community Archive',
  description:
    'How to cite Community Archive in a paper, post or project, with a copy-paste plain-text and BibTeX citation.',
}

export default function CitePage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Cite the archive</h1>

      <p className="mb-4">
        If you use Community Archive in a paper, post or project, please cite
        it as below. The archive changes every day, so include the date you
        accessed it; today&apos;s date is filled in for you.
      </p>

      <CitationBlocks />

      <p className="mb-4">
        If you worked from the{' '}
        <a
          className="underline"
          href="https://github.com/TheExGenesis/community-archive/releases/latest"
        >
          daily export
        </a>
        , also name the release you downloaded (for example{' '}
        <code>public-export-2026-11-17</code>) so others can find the same
        snapshot. See the <Link className="underline" href="/docs">docs</Link>{' '}
        for the export and the API.
      </p>

      <p className="mb-4">
        The tweets belong to the people who wrote them. When you quote one,
        credit its author as well as the archive.
      </p>
    </div>
  )
}
