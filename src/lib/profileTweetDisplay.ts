const restoreObviousLineBreaks = (text: string) =>
  text
    .replace(/([a-z]{2,})([A-Z][a-z])/g, '$1\n$2')
    .replace(/\b([A-Z]{2,})([a-z]{2,})\b/g, '$1\n$2')

export const addCosmeticLineBreaks = (text: string) => {
  if (text.includes('\n') || text.includes('\r')) return text

  return text
    .split(/(https?:\/\/\S+)/g)
    .map((part, index) =>
      index % 2 === 0 ? restoreObviousLineBreaks(part) : part,
    )
    .join('')
}
