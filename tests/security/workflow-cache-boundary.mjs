// Run with Node 24: node tests/security/workflow-cache-boundary.mjs
// To reproduce the old graph before the removal: append --baseline.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(path.join(root, 'package.json'))

async function inspectBaseline() {
  // Resolve each real parent edge; do not import an unrelated root copy.
  let parent = require
  const resolved = {}
  for (const name of [
    'workflow',
    '@workflow/nest',
    '@swc/cli',
    '@xhmikosr/bin-wrapper',
    '@xhmikosr/downloader',
    'got',
    'cacheable-request',
    'http-cache-semantics',
  ]) {
    resolved[name] = parent.resolve(name)
    parent = createRequire(resolved[name])
  }
  const { default: download } = await import(
    pathToFileURL(resolved['@xhmikosr/downloader']).href
  )
  const hits = new Map()
  const server = createServer((req, res) => {
    const count = (hits.get(req.url) ?? 0) + 1
    hits.set(req.url, count)
    const directive = req.url.startsWith('/proxy')
      ? 'max-age=600, proxy-revalidate'
      : req.url.startsWith('/private')
        ? 'private, max-age=600'
        : 'max-age=600'
    res.writeHead(200, {
      'cache-control': directive,
      ...(req.url.startsWith('/proxy')
        ? {}
        : { 'set-cookie': `synthetic-session=${count}` }),
      'content-type': 'application/octet-stream',
    })
    res.end(`synthetic-body-${count}`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function fetchDownload(url, options) {
    const request = download(url, options)
    let headers
    request.once('response', (response) => {
      headers = response.headers
    })
    return { body: await request, headers }
  }
  try {
    const first = await download(`${base}/default`)
    const second = await download(`${base}/default`, {
      got: { headers: { 'cache-control': 'max-stale=99999' } },
    })
    assert.notDeepEqual(first, second)
    assert.equal(hits.get('/default'), 2)
    console.log(
      'PASS actual downloader default: max-stale still hits origin twice',
    )

    // Opt in to shared caching to expose the advisory precondition. The
    // bin-wrapper caller does not pass this option in its real download path.
    for (const route of ['/cookie', '/proxy', '/private']) {
      const cache = new Map()
      const first = await fetchDownload(`${base}${route}`, { got: { cache } })
      const second = await fetchDownload(`${base}${route}`, {
        got: { cache, headers: { 'cache-control': 'max-stale=99999' } },
      })
      if (route === '/private') {
        assert.notDeepEqual(first.body, second.body)
        assert.equal(hits.get(route), 2)
      } else {
        assert.deepEqual(first.body, second.body)
        assert.equal(hits.get(route), 1)
        if (route === '/cookie') {
          assert.deepEqual(second.headers['set-cookie'], [
            'synthetic-session=1',
          ])
        }
      }
      console.log(`PASS baseline ${route}: origin requests=${hits.get(route)}`)
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
}

async function verifyRemoval() {
  const { readPackage } = require(path.join(root, '.pnpmfile.cjs')).hooks
  const metadata = {
    name: 'workflow',
    version: '5.2.2',
    dependencies: {
      '@workflow/nest': '5.1.3',
      '@workflow/next': '5.0.5',
    },
  }
  assert.deepEqual(readPackage(metadata).dependencies, {
    '@workflow/next': '5.0.5',
  })
  const unrelated = { name: 'another-package', version: '1.0.0' }
  assert.equal(readPackage(unrelated), unrelated)
  assert.throws(
    () => readPackage({ name: 'workflow', version: '5.2.3' }),
    /Review/,
  )
  const lock = await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  for (const name of [
    '@workflow/nest',
    '@swc/cli',
    '@xhmikosr/bin-wrapper',
    '@xhmikosr/downloader',
    'cacheable-request',
    'http-cache-semantics',
  ]) {
    assert.doesNotMatch(lock, new RegExp(`^  ['"]?${name}@`, 'm'))
  }
  const workflowRequire = createRequire(require.resolve('workflow'))
  assert.throws(() => workflowRequire.resolve('@workflow/nest'), {
    code: 'MODULE_NOT_FOUND',
  })
  for (const specifier of ['workflow', 'workflow/api', 'workflow/runtime']) {
    await import(specifier)
  }
  const cli = path.resolve(
    path.dirname(require.resolve('workflow')),
    '../bin/run.js',
  )
  const help = execFileSync(process.execPath, [cli, '--help'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    env: { PATH: process.env.PATH, NODE_ENV: 'production', NO_COLOR: '1' },
  })
  assert.match(help, /Usage:|USAGE/)
  const config = await require(path.join(root, 'next.config.js'))(
    'phase-production-server',
    {},
  )
  assert.equal(typeof config.webpack, 'function')
  console.log(
    'PASS removed graph; retained root/api/runtime/config and CLI help',
  )

  // Exercise the actual Next Workflow builder on a synthetic entrypoint.
  // This compiles bundles and a manifest; it never starts or executes a run.
  const cacheDir = path.join(root, 'node_modules/.cache')
  await mkdir(cacheDir, { recursive: true })
  const fixture = await mkdtemp(path.join(cacheDir, 'workflow-cache-boundary-'))
  const previousCwd = process.cwd()
  try {
    await mkdir(path.join(fixture, 'app'), { recursive: true })
    await symlink(
      path.join(root, 'node_modules'),
      path.join(fixture, 'node_modules'),
    )
    await writeFile(path.join(fixture, 'package.json'), '{"private":true}')
    await writeFile(
      path.join(fixture, 'app/route.ts'),
      `export async function syntheticStep(value: string) {
  'use step';
  return value.toUpperCase();
}
export async function syntheticWorkflow(value: string) {
  'use workflow';
  return await syntheticStep(value);
}
export async function GET() { return new Response('fixture'); }
`,
    )
    process.chdir(fixture)
    const { withWorkflow } = require('workflow/next')
    await withWorkflow({})('phase-production-build', {})
    const generated = path.join(fixture, 'app/.well-known/workflow/v1')
    const manifest = JSON.parse(
      await readFile(path.join(generated, 'manifest.json'), 'utf8'),
    )
    assert.ok(JSON.stringify(manifest).includes('syntheticWorkflow'))
    assert.ok(JSON.stringify(manifest).includes('syntheticStep'))
    for (const file of [
      'flow/route.js',
      // Workflow 5 registers steps beside the flow route.
      'flow/__step_registrations.js',
      'webhook/[token]/route.js',
    ]) {
      assert.ok((await readFile(path.join(generated, file), 'utf8')).length > 0)
    }
    console.log(
      'PASS actual Next Workflow builder emits flow, step registrations, webhook, and manifest',
    )
  } finally {
    process.chdir(previousCwd)
    await rm(fixture, { recursive: true, force: true })
  }
}

if (process.argv.includes('--baseline')) {
  await inspectBaseline()
} else {
  await verifyRemoval()
}
