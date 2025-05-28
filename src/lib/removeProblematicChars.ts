export function removeProblematicCharacters(text: string): string {
  return text.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
}
