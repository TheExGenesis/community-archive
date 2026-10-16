// Twitter's CDN already serves resized variants (`_normal`, `/1500x500`, ...),
// so sending its images through Vercel's optimizer only adds per-image cost.
export function isTwitterImage(src: string | null | undefined): boolean {
  if (!src) return false
  try {
    return new URL(src).hostname === 'pbs.twimg.com'
  } catch {
    return false
  }
}
