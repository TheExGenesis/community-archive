import 'dotenv/config'
import { rename, unlink, writeFile } from 'node:fs/promises'

const apiUrl = 'https://fabxmporizzqflnftavs.supabase.co/rest/v1/'
const outputPath = new URL('../public/openapi.json', import.meta.url)
const temporaryPath = new URL('../public/openapi.json.tmp', import.meta.url)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE

if (!serviceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE is required to read the PostgREST OpenAPI schema.',
  )
}

try {
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/openapi+json',
      apikey: serviceRoleKey,
    },
  })

  if (!response.ok) {
    throw new Error(
      `PostgREST schema request failed: ${response.status} ${response.statusText}`,
    )
  }

  const specification = await response.json()

  if (
    specification?.swagger !== '2.0' ||
    !specification.paths ||
    Object.keys(specification.paths).length === 0
  ) {
    throw new Error('PostgREST returned an invalid or empty OpenAPI schema.')
  }

  // Supabase's gateway mounts PostgREST below /rest/v1, but PostgREST itself
  // reports `/` because it cannot see the external gateway prefix.
  specification.basePath = '/rest/v1'
  specification.info.title = 'Community Archive public read API'
  specification.info.description =
    'Public PostgREST resources for Community Archive. Supply the public anon key as both the apikey header and an Authorization: Bearer token.'
  specification.securityDefinitions = {
    apiKey: {
      type: 'apiKey',
      name: 'apikey',
      in: 'header',
      description: 'The public Community Archive Supabase anon key.',
    },
    bearerAuth: {
      type: 'apiKey',
      name: 'Authorization',
      in: 'header',
      description: 'Bearer followed by the public Supabase anon key.',
    },
  }
  specification.security = [{ apiKey: [], bearerAuth: [] }]

  // PostgREST describes every operation visible to the service role. The
  // public API is intentionally read-only, so do not advertise write methods
  // or service-role-only RPCs in the public reference.
  for (const [path, operations] of Object.entries(specification.paths)) {
    if (path === '/' || path.startsWith('/rpc/') || !operations.get) {
      delete specification.paths[path]
      continue
    }
    specification.paths[path] = { get: operations.get }
  }

  await writeFile(temporaryPath, `${JSON.stringify(specification)}\n`)
  await rename(temporaryPath, outputPath)

  console.log(
    `Wrote ${Object.keys(specification.paths).length} public API paths to public/openapi.json`,
  )
} catch (error) {
  await unlink(temporaryPath).catch(() => undefined)
  throw error
}
