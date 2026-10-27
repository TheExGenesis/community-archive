import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Follow live dependency links; stale package directories are not evidence.
const require = createRequire(new URL('../../../package.json', import.meta.url))
const workflowRequire = createRequire(require.resolve('workflow'))
export const coreDirectory = dirname(workflowRequire.resolve('@workflow/core'))
export const coreRequire = createRequire(
  pathToFileURL(resolve(coreDirectory, 'index.js')),
)
export const nanoidDirectory = dirname(
  coreRequire.resolve('nanoid/package.json'),
)
export const nanoid = await import(
  pathToFileURL(resolve(nanoidDirectory, 'index.js'))
)
const { runWorkflow } = await import(
  pathToFileURL(resolve(coreDirectory, 'workflow.js'))
)
const serde = await import(
  pathToFileURL(resolve(coreDirectory, 'serialization.js'))
)
const { WorkflowSuspension } = await import(
  pathToFileURL(resolve(coreDirectory, 'global.js'))
)

export async function exerciseWorkflow(fixture, events = []) {
  const workflowName = 'workflow//fixture//nanoidCompat'
  const workflowRun = {
    runId: fixture.runId,
    workflowName,
    status: 'running',
    startedAt: new Date(fixture.startedAt),
    specVersion: 2,
  }
  workflowRun.input = await serde.dehydrateWorkflowArguments(
    [],
    fixture.runId,
    undefined,
  )
  // Actual core creates hook IDs with its ULID generator and hook tokens with
  // Nanoid. Interleave other seeded consumers to catch PRNG consumption drift.
  const code = `globalThis.__private_workflows = new Map([[${JSON.stringify(workflowName)}, async () => {
    const hooks = [], output = [];
    for (let i = 0; i < ${fixture.count}; i++) {
      const before = Math.random(), uuid = crypto.randomUUID();
      const options = i % 3 === 1 ? { token: 'explicit_fixture_' + i } : {};
      const hook = globalThis[Symbol.for('WORKFLOW_CREATE_HOOK')](options);
      hooks.push(hook);
      output.push({ token: hook.token, before, uuid, after: Math.random(),
        ulid: globalThis[Symbol.for('WORKFLOW_STABLE_ULID')](Date.now()) });
    }
    await hooks[hooks.length - 1].getConflict();
    for (const hook of hooks) hook.dispose();
    return output;
  }]]);`
  try {
    const result = await runWorkflow(code, workflowRun, events, undefined)
    return {
      output: await serde.hydrateWorkflowReturnValue(
        result,
        fixture.runId,
        undefined,
      ),
    }
  } catch (error) {
    if (!WorkflowSuspension.is(error)) throw error
    return {
      pending: error.steps.map(({ type, correlationId, token }) => ({
        type,
        correlationId,
        token,
      })),
    }
  }
}

export function hookEvents(fixture) {
  return fixture.pending.map((hook, index) => ({
    eventId: `evnt_fixture_${index}`,
    eventType: 'hook_created',
    correlationId: hook.correlationId,
    createdAt: new Date(fixture.startedAt),
    eventData: { token: hook.token },
  }))
}
