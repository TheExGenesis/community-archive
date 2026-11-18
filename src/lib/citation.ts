// The canonical citation for the archive. Keep in step with CITATION.cff at
// the repository root, which GitHub reads for its "Cite this repository" box.
export const CITATION = {
  title: 'Community Archive',
  authorFamily: 'Carvalho',
  authorGiven: 'Francisco',
  year: 2024,
  url: 'https://www.community-archive.org',
}

export const ACCESS_DATE_PLACEHOLDER = '[date you accessed it]'

/** `accessDate` is an ISO date (YYYY-MM-DD) or the placeholder. */
export function plainCitation(accessDate: string) {
  const initial = CITATION.authorGiven.charAt(0)
  return `${CITATION.authorFamily}, ${initial}. (${CITATION.year}). ${CITATION.title} [Data set]. ${CITATION.url} (accessed ${accessDate})`
}

export function bibtexCitation(accessDate: string) {
  return [
    '@misc{community_archive,',
    `  author       = {${CITATION.authorFamily}, ${CITATION.authorGiven}},`,
    `  title        = {${CITATION.title}},`,
    `  year         = {${CITATION.year}},`,
    `  howpublished = {\\url{${CITATION.url}}},`,
    `  note         = {Accessed ${accessDate}}`,
    '}',
  ].join('\n')
}
