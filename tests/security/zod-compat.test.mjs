import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import {
  baseRun,
  invalidCases,
  normalized,
  now,
  runId,
  serializedFieldCases,
} from './fixtures/workflow-serialized-cases.mjs'

// Follow actual dependency links, so a stale .pnpm directory cannot pass this test.
const root = createRequire(new URL('../../package.json', import.meta.url))
const workflow = createRequire(root.resolve('workflow'))
const core = createRequire(workflow.resolve('@workflow/core'))
const cli = createRequire(workflow.resolve('@workflow/cli/package.json'))
const world = createRequire(core.resolve('@workflow/world'))
const local = createRequire(core.resolve('@workflow/world-local'))
const vercel = createRequire(core.resolve('@workflow/world-vercel'))
const functions = createRequire(core.resolve('@vercel/functions'))
const oidc = createRequire(functions.resolve('@vercel/oidc'))
const authEntry = cli.resolve('@vercel/cli-auth/oauth.js')
const auth = createRequire(authEntry)
const configEntry = oidc.resolve('@vercel/cli-config')
const config = createRequire(configEntry)
const schemas = await import(pathToFileURL(core.resolve('@workflow/world')))
const localDir = path.dirname(core.resolve('@workflow/world-local'))
const { createRunsStorage } = await import(
  pathToFileURL(path.join(localDir, 'storage/runs-storage.js'))
)
const { createEventsStorage } = await import(
  pathToFileURL(path.join(localDir, 'storage/events-storage.js'))
)
const { jsonReplacer, jsonReviver, writeJSON } = await import(
  pathToFileURL(path.join(localDir, 'fs.js'))
)

async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ca-zod-regression-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('all seven affected consumers resolve the fixed stock Zod', () => {
  for (const consumer of [core, cli, world, local, vercel, auth, config]) {
    assert.equal(consumer('zod/package.json').version, '4.6.6')
  }
})

test('five serialized field sites keep Workflow 5 optionality for omitted, undefined, null, binary and legacy values', () => {
  for (const fixture of serializedFieldCases()) {
    if (fixture.requiredKey && fixture.valueName === 'absent') {
      assert.equal(
        schemas[fixture.schema].safeParse(fixture.input).success,
        false,
        fixture.name,
      )
      continue
    }
    assert.deepEqual(
      schemas[fixture.schema].parse(fixture.input),
      normalized(fixture.input),
      fixture.name,
    )
  }
  for (const [name, input] of invalidCases) {
    assert.equal(schemas[name].safeParse(input).success, false, name)
  }
})

test('actual local storage get/list handles JSON that drops undefined fields', async (t) => {
  const dir = await temporary(t)
  let count = 0
  for (const fixture of serializedFieldCases()) {
    const basedir = path.join(dir, String(count++))
    const isRun = fixture.schema === 'WorkflowRunSchema'
    const eventId = 'evnt_01K91ZQM000000000000000001'
    const input = isRun
      ? fixture.input
      : { ...fixture.input, runId, eventId, createdAt: now }
    const file = path.join(
      basedir,
      // Workflow 5 local storage nests events under their run.
      ...(isRun ? ['runs'] : ['events', runId]),
      `${isRun ? runId : `${runId}-${eventId}`}.json`,
    )
    await writeJSON(file, input)
    const persisted = await readFile(file, 'utf8')
    const record = JSON.parse(persisted, jsonReviver)
    // Workflow 5's event schema requires these keys, but its local reader
    // restores a key that JSON dropped as undefined.
    const dropped =
      fixture.requiredKey && !Object.hasOwn(record.eventData, fixture.field)
    const expected = schemas[isRun ? 'WorkflowRunSchema' : 'EventSchema'].parse(
      dropped
        ? {
            ...record,
            eventData: { ...record.eventData, [fixture.field]: undefined },
          }
        : record,
    )
    if (fixture.valueName === 'undefined' || fixture.valueName === 'absent') {
      assert.equal(
        Object.hasOwn(
          isRun ? JSON.parse(persisted) : JSON.parse(persisted).eventData,
          fixture.field,
        ),
        false,
      )
    }
    const storage = isRun
      ? createRunsStorage(basedir)
      : createEventsStorage(basedir)
    const actual = isRun
      ? await storage.get(runId, { resolveData: 'all' })
      : await storage.get(runId, eventId, { resolveData: 'all' })
    assert.deepEqual(actual, expected, fixture.name)
    const listed = await storage.list({
      ...(isRun ? {} : { runId }),
      resolveData: 'all',
    })
    assert.deepEqual(listed.data, [expected], fixture.name)
  }
  const invalidDir = path.join(dir, 'invalid')
  await writeJSON(path.join(invalidDir, 'runs', `${runId}.json`), {
    ...baseRun,
    status: 'pending',
    output: null,
  })
  await assert.rejects(
    createRunsStorage(invalidDir).get(runId),
    /Invalid input/,
  )
})

test('stock array/set/map upper bounds reject before element parsing, including compiled paths', () => {
  for (const [consumer, mini] of [
    [world, false],
    [auth, true],
  ]) {
    const z = mini ? consumer('zod/mini') : consumer('zod').z
    for (const compiled of [false, true]) {
      for (const kind of [
        'arrayMax',
        'arrayLength',
        'setMax',
        'setSize',
        'mapMax',
        'mapSize',
      ]) {
        let visits = 0
        const item = mini
          ? z.string().check(() => {
              visits++
            })
          : z.string().superRefine(() => {
              visits++
            })
        const shape = {
          arrayMax: () =>
            mini ? z.array(item).check(z.maxLength(2)) : z.array(item).max(2),
          arrayLength: () =>
            mini ? z.array(item).check(z.length(2)) : z.array(item).length(2),
          setMax: () =>
            mini ? z.set(item).check(z.maxSize(2)) : z.set(item).max(2),
          setSize: () =>
            mini ? z.set(item).check(z.size(2)) : z.set(item).size(2),
          mapMax: () =>
            mini
              ? z.map(item, item).check(z.maxSize(2))
              : z.map(item, item).max(2),
          mapSize: () =>
            mini
              ? z.map(item, item).check(z.size(2))
              : z.map(item, item).size(2),
        }[kind]()
        const schema = compiled ? z.compile(shape, { strict: true }) : shape
        const values = ['a', 'b', 'c', 'd']
        const input = kind.startsWith('array')
          ? values
          : kind.startsWith('set')
            ? new Set(values)
            : new Map(values.map((value) => [value, value]))
        const result = schema.safeParse(input)
        assert.equal(result.success, false, `${kind}/${compiled}`)
        assert.equal(visits, 0, `${kind}/${compiled}`)
        assert.equal(result.error.issues.length, 1)
        assert.equal(result.error.issues[0].code, 'too_big')
      }
    }
  }
})

test('Vercel config public parsers and explicit temporary-file read/write preserve config', async (t) => {
  const api = config(configEntry)
  const dir = await temporary(t)
  const globalConfig = {
    credStorage: 'file',
    telemetry: { enabled: false, future: 1 },
    guidance: {},
    updates: { auto: true },
    useNativeBinary: false,
    future: 'preserved',
  }
  const authConfig = {
    token: 'synthetic',
    refreshToken: 'fixture',
    expiresAt: 123,
    tokenSource: 'env',
    userId: 'user_fixture',
    future: true,
  }
  assert.deepEqual(api.parseGlobalConfig({}), {})
  assert.deepEqual(api.parseGlobalConfig(globalConfig), globalConfig)
  assert.deepEqual(api.parseAuthConfig(authConfig), authConfig)
  const { tokenSource, ...fileConfig } = authConfig
  assert.deepEqual(api.parseAuthFileConfig(authConfig), fileConfig)
  for (const invalid of [
    null,
    { credStorage: 'invalid' },
    { telemetry: { enabled: 1 } },
    { updates: { auto: 'yes' } },
    { useNativeBinary: null },
  ])
    assert.throws(() => api.parseGlobalConfig(invalid))
  for (const invalid of [
    null,
    { token: 3 },
    { expiresAt: '123' },
    { skipWrite: 'yes' },
    { tokenSource: 'disk' },
  ])
    assert.throws(() => api.parseAuthConfig(invalid))
  const globalFile = path.join(dir, 'config.json')
  const authFile = path.join(dir, 'auth.json')
  api.writeGlobalConfigFile(globalFile, globalConfig)
  api.writeAuthConfigFile(authFile, fileConfig)
  assert.deepEqual(api.readGlobalConfigFile(globalFile), globalConfig)
  assert.deepEqual(api.readAuthFileConfig(authFile), fileConfig)
  assert.equal(fs.statSync(authFile).mode & 0o777, 0o600)
})

test('CLI credential parser uses synthetic mocked filesystem only', (t) => {
  const { CredentialsStore } = auth('./credentials-store.js')
  // Load the module before mocking fs, then forbid any real credential lookup.
  t.mock.method(fs, 'lstatSync', () => {
    throw Object.assign(new Error('synthetic missing path'), { code: 'ENOENT' })
  })
  const store = CredentialsStore('ca-security-synthetic')
  let value = {}
  t.mock.method(fs, 'readFileSync', (filename) => {
    assert.equal(filename, store.configPath)
    return JSON.stringify(value)
  })
  assert.deepEqual(store.get(), {})
  value = {
    token: 'synthetic',
    refreshToken: 'fixture',
    expiresAt: 123,
    skipWrite: true,
    unexpected: 'stripped',
  }
  assert.deepEqual(store.get(), {
    token: 'synthetic',
    refreshToken: 'fixture',
    expiresAt: 123,
    skipWrite: true,
  })
  for (const invalid of [
    null,
    { token: 3 },
    { expiresAt: '123' },
    { skipWrite: 1 },
  ]) {
    value = invalid
    assert.throws(() => store.get())
  }
})

test('CLI OAuth, device, introspection, error and SSO schemas use synthetic responses only', async (t) => {
  const { OAuth, isOAuthError } = auth('./oauth.js')
  const { parseSSOError } = auth('./sso.js')
  const issuer = new URL('https://fixture.invalid/')
  const api = OAuth({ issuer, clientId: 'fixture', userAgent: 'fixture' })
  let response
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify(response), { status: 200 }),
  )
  response = {
    issuer: issuer.origin,
    device_authorization_endpoint: `${issuer}device`,
    token_endpoint: `${issuer}token`,
    revocation_endpoint: `${issuer}revoke`,
    jwks_uri: `${issuer}jwks`,
    introspection_endpoint: `${issuer}introspect`,
    unknown: 'stripped',
  }
  const metadata = await api.authorizationServerMetadata()
  assert.equal(metadata.issuer, issuer.origin)
  assert.equal(Object.hasOwn(metadata, 'unknown'), false)
  response = { ...response, token_endpoint: 'invalid-url' }
  await assert.rejects(api.authorizationServerMetadata())
  response = {
    device_code: 'fixture',
    user_code: 'fixture',
    verification_uri: `${issuer}verify`,
    verification_uri_complete: `${issuer}verify?fixture`,
    expires_in: 100,
    interval: 5,
  }
  assert.equal((await api.deviceAuthorizationRequest()).device_code, 'fixture')
  response = { ...response, expires_in: 'invalid' }
  await assert.rejects(api.deviceAuthorizationRequest())
  response = { active: false }
  assert.deepEqual(await api.introspectToken('synthetic'), response)
  response = {
    active: true,
    client_id: 'fixture',
    session_id: 'fixture',
    unknown: 'stripped',
  }
  assert.deepEqual(await api.introspectToken('synthetic'), {
    active: true,
    client_id: 'fixture',
    session_id: 'fixture',
  })
  response = { active: 'invalid' }
  await assert.rejects(api.introspectToken('synthetic'))
  for (const tokens of [
    { access_token: 'synthetic', token_type: 'Bearer', expires_in: 10 },
    {
      access_token: 'synthetic',
      token_type: 'Bearer',
      expires_in: 10,
      refresh_token: 'synthetic',
      scope: 'fixture',
    },
  ]) {
    const [error, data] = await api.processTokenResponse(
      new Response(JSON.stringify({ ...tokens, unknown: 'stripped' })),
    )
    assert.equal(error, null)
    assert.deepEqual(data, tokens)
  }
  for (const invalid of [
    null,
    {},
    { access_token: 'fixture', token_type: 'bearer', expires_in: 10 },
  ]) {
    const [error] = await api.processTokenResponse(
      new Response(JSON.stringify(invalid)),
    )
    assert.equal(isOAuthError(error), true)
    assert.equal(error.code, 'server_error')
  }
  const [oauthError] = await api.processTokenResponse(
    new Response(
      JSON.stringify({ error: 'invalid_grant', error_description: 'fixture' }),
    ),
  )
  assert.equal(oauthError.code, 'invalid_grant')
  const sso = {
    code: 'sso_required',
    message: 'fixture',
    enforced: true,
    scope: 'fixture',
  }
  assert.deepEqual(parseSSOError({ ...sso, unknown: true }), sso)
  for (const invalid of [
    null,
    {},
    { ...sso, enforced: false },
    { ...sso, message: 3 },
    { ...sso, scope: null },
  ])
    assert.equal(parseSSOError(invalid), undefined)
})
