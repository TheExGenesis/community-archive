import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  coreDirectory,
  coreRequire,
  nanoidDirectory,
  nanoid,
  exerciseWorkflow,
  hookEvents,
} from './fixtures/nanoid-workflow-runner.mjs'

const baseline = JSON.parse(
  readFileSync(
    new URL('./fixtures/nanoid-workflow-core5.2.2.json', import.meta.url),
  ),
)
const packageInfo = JSON.parse(
  readFileSync(resolve(nanoidDirectory, 'package.json')),
)
const seedrandom = coreRequire('seedrandom')
const originalSeed =
  'wrun_fixture:workflow//./src/workflows/digestGeneration//publishNightlyDigestWorkflow:1793059200000'
const alphabet =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'

function fixedVector(library) {
  let calls = 0,
    bytes = 0
  const random = seedrandom(originalSeed)
  const generate = library.customRandom(library.urlAlphabet, 21, (size) => {
    calls++
    bytes += size
    return new Uint8Array(size).map(() => 256 * random())
  })
  return {
    ids: Array.from({ length: 4 }, () => generate()),
    calls,
    bytes,
    nextRandom: random(),
  }
}
const expectedVector = {
  ids: [
    'dO1nvc1_Gbu204M1Xs907',
    '55_n3qUF1vgyizK92l95c',
    'IzPY8hLXUCJos51q9loOq',
    'zGcm8SkRBikJlAV8tnTH0',
  ],
  calls: 4,
  bytes: 136,
  nextRandom: 0.8573081080624201,
}

test('the live Workflow edge uses the supported, security-fixed Nanoid3 branch', () => {
  assert.equal(packageInfo.version, '3.3.20')
  assert.equal(nanoid.urlAlphabet, alphabet)
  for (const name of ['nanoid', 'random', 'customAlphabet', 'customRandom']) {
    assert.equal(typeof nanoid[name], 'function')
    assert.equal(typeof coreRequire('nanoid')[name], 'function')
  }
})

test('ESM and CJS preserve historical seeded bytes, IDs and next PRNG value', () => {
  assert.deepEqual(fixedVector(nanoid), expectedVector)
  assert.deepEqual(fixedVector(coreRequire('nanoid')), expectedVector)
})

for (const fixture of baseline.cases) {
  test(`actual core suspension and saved-event replay: ${fixture.runId}/${fixture.startedAt}/${fixture.count}`, async () => {
    // Golden values were captured before changing the override, using the
    // unmodified core5.2.2 + Nanoid5.1.6; do not regenerate on upgrade.
    assert.deepEqual(await exerciseWorkflow(fixture), {
      pending: fixture.pending,
    })
    assert.deepEqual(await exerciseWorkflow(fixture, hookEvents(fixture)), {
      output: fixture.output,
    })
  })
}

function isolatedCase(source) {
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', source],
    {
      timeout: 2500,
      encoding: 'utf8',
      env: {},
    },
  )
  assert.ifError(child.error)
  assert.equal(child.status, 0, child.stderr)
  return JSON.parse(child.stdout)
}

test('GHSA-xwg4: overflow/negative input cannot poison secure generation or random()', () => {
  const output = isolatedCase(`
    import {createRequire} from 'node:module';
    import crypto from 'node:crypto';
    const require=createRequire(${JSON.stringify(resolve(coreDirectory, 'index.js'))});
    // Deterministic synthetic CSPRNG bytes make pool integrity assertions exact.
    crypto.randomFillSync = buffer => {buffer.fill(1);return buffer;};
    const {nanoid,random}=require('nanoid');
    const result={warm:nanoid(),errors:[],after:[]};
    for(const value of [-1,-2147483648,2147483648,4294967295,1025]) {
      for(const generate of [nanoid,random]) {
        try {generate(value);result.errors.push(null);} catch(e) {result.errors.push(e.name);}
        result.after.push(nanoid());
      }
    }
    result.zero=nanoid(0); result.bytes=Array.from(random(4));
    console.log(JSON.stringify(result));
  `)
  assert.equal(output.warm, 's'.repeat(21))
  assert.deepEqual(output.errors, Array(10).fill('RangeError'))
  assert.deepEqual(output.after, Array(10).fill('s'.repeat(21)))
  assert.equal(output.zero, '')
  assert.deepEqual(output.bytes, [1, 1, 1, 1])
  // Also execute the consumer's ESM export, which has its own module pool.
  nanoid.nanoid()
  assert.throws(() => nanoid.nanoid(2147483648), RangeError)
  assert.throws(() => nanoid.random(-1), RangeError)
  assert.match(nanoid.nanoid(), /^[A-Za-z0-9_-]{21}$/)
  assert.match(nanoid.customAlphabet('ab', 8)(), /^[ab]{8}$/)
})

test('GHSA-28wg: non-secure negative-size calls terminate in ESM and CJS', () => {
  const output = isolatedCase(`
    import {createRequire} from 'node:module';
    const require=createRequire(${JSON.stringify(resolve(coreDirectory, 'index.js'))});
    const esm=await import(${JSON.stringify(new URL('non-secure/index.js', 'file://' + nanoidDirectory + '/').href)});
    const cjs=require('nanoid/non-secure');
    const values=[];
    for(const library of [esm,cjs]) for(const size of [-1,-2147483648,0]) {
      values.push(library.nanoid(size), library.customAlphabet('ab',size)(), library.customAlphabet('ab')(size));
    }
    console.log(JSON.stringify(values));
  `)
  assert.deepEqual(output, Array(18).fill(''))
})

test('the installed bundler resolves Node and browser ESM exports with the same seeded contract', async () => {
  const require = createRequire(new URL('../../package.json', import.meta.url))
  const tsxRequire = createRequire(require.resolve('tsx'))
  const { build } = tsxRequire('esbuild')
  for (const platform of ['node', 'browser']) {
    const bundle = await build({
      stdin: { contents: "export * from 'nanoid'", resolveDir: coreDirectory },
      platform,
      format: 'esm',
      bundle: true,
      write: false,
      logLevel: 'silent',
    })
    const library = await import(
      'data:text/javascript;base64,' +
        Buffer.from(bundle.outputFiles[0].text).toString('base64')
    )
    assert.deepEqual(fixedVector(library), expectedVector)
    assert.match(library.nanoid(), /^[A-Za-z0-9_-]{21}$/)
  }
})
