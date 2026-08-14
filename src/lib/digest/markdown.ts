export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(^|\s)([*_~`]{1,3})(?=\S)/g, '$1')
    .replace(/([*_~`]{1,3})(?=\s|$|[.,!?;:])/g, '')
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
