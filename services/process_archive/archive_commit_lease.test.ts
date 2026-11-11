import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import postgres from 'postgres'
import {
  claimArchiveUpload,
  commitLeaseConfigFromEnv,
  finishArchiveUpload,
  reclaimExpiredCommitLeases,
  startCommitHeartbeat,
} from './archive_commit_lease'

test('lease config defaults and validation', () => {
  assert.deepEqual(commitLeaseConfigFromEnv({}), {
    leaseSeconds: 900,
    heartbeatMs: 60_000,
    maxAttempts: 3,
  })
  assert.deepEqual(
    commitLeaseConfigFromEnv({ ARCHIVE_COMMIT_LEASE_SECONDS: '30' })
      .heartbeatMs,
    10_000,
  )
  assert.throws(
    () =>
      commitLeaseConfigFromEnv({
        ARCHIVE_COMMIT_LEASE_SECONDS: '60',
        ARCHIVE_COMMIT_HEARTBEAT_MS: '45000',
      }),
    /at most half/,
  )
})

// Needs a disposable database with the migrations applied, e.g. a local
// Supabase stack: ARCHIVE_LEASE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
const databaseUrl = process.env.ARCHIVE_LEASE_TEST_DATABASE_URL
const db = {
  skip: databaseUrl ? false : 'ARCHIVE_LEASE_TEST_DATABASE_URL is not set',
}
const ACCOUNT = '990000000000000701'
const config = { leaseSeconds: 60, heartbeatMs: 20, maxAttempts: 2 }
let sql: postgres.Sql

before(async () => {
  if (!databaseUrl) return
  sql = postgres(databaseUrl, { max: 3, onnotice: () => {} })
  await cleanup()
  await sql`
    INSERT INTO public.all_account (account_id, created_via, username, created_at, account_display_name)
    VALUES (${ACCOUNT}, 'twitter_archive', 'LeaseFixture', now(), 'Lease Fixture')
  `
})

after(async () => {
  if (!databaseUrl) return
  await cleanup()
  await sql.end()
})

async function cleanup() {
  await sql`DELETE FROM public.archive_upload WHERE account_id = ${ACCOUNT}`
  await sql`DELETE FROM public.all_account WHERE account_id = ${ACCOUNT}`
}

async function readyUpload(): Promise<number> {
  const [row] = await sql`
    INSERT INTO public.archive_upload (account_id, username, archive_at, upload_phase)
    VALUES (${ACCOUNT}, 'LeaseFixture', now(), 'ready_for_commit')
    RETURNING id
  `
  return Number(row.id)
}

async function phaseOf(id: number) {
  const [row] = await sql`
    SELECT upload_phase, commit_claim_id, commit_attempts
    FROM public.archive_upload WHERE id = ${id}
  `
  return row
}

async function expireLease(id: number) {
  await sql`
    UPDATE public.archive_upload
    SET commit_heartbeat_at = now() - interval '2 minutes'
    WHERE id = ${id}
  `
}

test(
  'a claim is exclusive and completes only with its own claim id',
  db,
  async () => {
    const id = await readyUpload()
    const claimId = await claimArchiveUpload(sql, id)
    assert.ok(claimId)
    assert.equal(await claimArchiveUpload(sql, id), null)
    assert.equal((await phaseOf(id)).commit_claim_id, claimId)

    assert.equal(
      await finishArchiveUpload(
        sql,
        id,
        '00000000-0000-4000-8000-000000000000',
        'completed',
      ),
      false,
    )
    assert.equal((await phaseOf(id)).upload_phase, 'committing')

    assert.equal(await finishArchiveUpload(sql, id, claimId, 'completed'), true)
    const done = await phaseOf(id)
    assert.equal(done.upload_phase, 'completed')
    assert.equal(done.commit_claim_id, null)
  },
)

test(
  'a live heartbeat keeps the lease; an expired one is reclaimed',
  db,
  async () => {
    const id = await readyUpload()
    const claimId = (await claimArchiveUpload(sql, id))!
    await expireLease(id)

    const heartbeat = startCommitHeartbeat(sql, id, claimId, config)
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.deepEqual(
      (await reclaimExpiredCommitLeases(sql, config)).filter(
        (row) => row.id === id,
      ),
      [],
    )
    heartbeat.stop()

    await expireLease(id)
    const [reclaimed] = (await reclaimExpiredCommitLeases(sql, config)).filter(
      (row) => row.id === id,
    )
    assert.deepEqual(reclaimed, {
      id,
      upload_phase: 'ready_for_commit',
      commit_attempts: 1,
    })

    // The crashed run's late outcome no longer applies.
    assert.equal(
      await finishArchiveUpload(sql, id, claimId, 'completed'),
      false,
    )
    assert.equal((await phaseOf(id)).upload_phase, 'ready_for_commit')
  },
)

test('a heartbeat notices a lost claim', db, async () => {
  const id = await readyUpload()
  const claimId = (await claimArchiveUpload(sql, id))!
  await expireLease(id)
  await reclaimExpiredCommitLeases(sql, config)
  const heartbeat = startCommitHeartbeat(sql, id, claimId, config)
  await new Promise((resolve) => setTimeout(resolve, 100))
  heartbeat.stop()
  assert.equal(heartbeat.lost, true)
})

test('an upload reclaimed maxAttempts times fails', db, async () => {
  const id = await readyUpload()
  for (const expected of ['ready_for_commit', 'failed']) {
    await claimArchiveUpload(sql, id)
    await expireLease(id)
    const [row] = (await reclaimExpiredCommitLeases(sql, config)).filter(
      (reclaimed) => reclaimed.id === id,
    )
    assert.equal(row.upload_phase, expected)
  }
  assert.equal(await claimArchiveUpload(sql, id), null)
  assert.equal((await phaseOf(id)).commit_attempts, 2)
})
