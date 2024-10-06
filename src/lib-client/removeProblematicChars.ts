export function removeProblematicCharacters(text: string): string {
  return (
    text
      // Remove specific Unicode escape sequences
      .replace(/\\u000b|\\u0000/g, '')
      // Remove specific hexadecimal escape sequences
      .replace(/\\x0b|\\x00/g, '')
      // Remove actual control characters
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      // Remove remaining Unicode control characters and non-characters
      .replace(/[\u0000-\u001F\u007F-\u009F\uFFFE\uFFFF]/g, '')
  )
}
