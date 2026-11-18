// The canonical citation for the archive. Keep in step with CITATION.cff at
// the repository root, which GitHub reads for its "Cite this repository" box.
export const CITATION = {
  title: 'Community Archive',
  authorFamily: 'Carvalho',
  authorGiven: 'Francisco',
  year: 2024,
  url: 'https://www.community-archive.org',
  // Set once a DOI is registered, e.g. '10.5281/zenodo.1234567'. Also add it
  // to CITATION.cff as `doi:`.
  doi: null as string | null,
}

export const ACCESS_DATE_PLACEHOLDER = '[date you accessed it]'

function locator() {
  return CITATION.doi ? `https://doi.org/${CITATION.doi}` : CITATION.url
}

/** `accessDate` is an ISO date (YYYY-MM-DD) or the placeholder. */
export function plainCitation(accessDate: string) {
  const initial = CITATION.authorGiven.charAt(0)
  return `${CITATION.authorFamily}, ${initial}. (${CITATION.year}). ${CITATION.title} [Data set]. ${locator()} (accessed ${accessDate})`
}

export function bibtexCitation(accessDate: string) {
  const lines = [
    '@misc{community_archive,',
    `  author       = {${CITATION.authorFamily}, ${CITATION.authorGiven}},`,
    `  title        = {${CITATION.title}},`,
    `  year         = {${CITATION.year}},`,
    `  howpublished = {\\url{${CITATION.url}}},`,
  ]
  if (CITATION.doi) lines.push(`  doi          = {${CITATION.doi}},`)
  lines.push(`  note         = {Accessed ${accessDate}}`, '}')
  return lines.join('\n')
}
