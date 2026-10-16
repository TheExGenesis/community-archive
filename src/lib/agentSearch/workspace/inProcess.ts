import type { BashExecutor } from '../agent'
import type { RunLimits } from '../deadline'
import { applyChanges, type WorkspaceManifest } from './manifest'
import { runBashCommand } from './workspace'

/**
 * A bash executor for scripts (the eval runner): it carries the workspace
 * between commands the way the workflow does, through the manifest, so a
 * script exercises the same rebuild path as production.
 */
export function createInProcessBash(
  limits: RunLimits = {},
  initial: WorkspaceManifest = {},
): { execute: BashExecutor; manifest: () => WorkspaceManifest } {
  let manifest = initial
  let semanticUsed = 0
  return {
    execute: async ({ command }) => {
      const output = await runBashCommand({
        command,
        manifest,
        limits,
        semanticUsed,
      })
      manifest = applyChanges(manifest, output.workspace)
      semanticUsed += output.semanticCalls
      return output
    },
    manifest: () => manifest,
  }
}
