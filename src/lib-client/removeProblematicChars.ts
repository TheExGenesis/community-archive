export function removeProblematicCharacters(text: string): string {
  return text.replace(/\\x00/g, '')
}
