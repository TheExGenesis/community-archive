// fleet/lib/transcript.mjs, loaded from the checkout at runtime so the
// service shares the fixer's scrubbing and tool-call descriptions (one source
// of truth) wherever the compiled service lives.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { TranscriptLib } from '../types/transcript-lib.js'

let cached: Promise<TranscriptLib> | undefined

export function loadTranscriptLib(fleetRoot: string): Promise<TranscriptLib> {
  if (!cached) {
    const file = path.join(fleetRoot, 'fleet', 'lib', 'transcript.mjs')
    cached = import(pathToFileURL(file).href) as Promise<TranscriptLib>
  }
  return cached
}
