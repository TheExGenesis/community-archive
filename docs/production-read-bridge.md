# Production read bridge

This backend dependency lets a staging deployment read production content and
admin data without receiving the production Supabase service-role key. It does
not change the homepage or enable production reads in any staging deployment.

## Enable

After deploying the bridge, configure a server-only `PUBLIC_READ_SECRET` of at
least 32 random characters on production and on the intended staging branch.
Keep `DATA_READ_SOURCE` unset on production. The bridge returns 404 until its
secret is configured, and also rejects requests on preview deployments.

The caller posts an authenticated read envelope to `/api/public-data`, using
`Authorization: Bearer <PUBLIC_READ_SECRET>` with `operation: read`, a relative
`path`, `method: GET` or `HEAD`, and `role: anon` or `service_role`. The production
server supplies its own matching Supabase credential. Never send the bridge
secret to a browser or put it in a `NEXT_PUBLIC_` variable.

Only PostgREST table reads, audited RPC reads and the two display-data storage
buckets are accepted. Authentication endpoints, original archive files, unknown
RPCs, external targets and write methods are rejected. PostgREST uses read-only
database transactions for GET/HEAD, including RPCs. Caller authorization headers
are discarded. Responses are never cached; upstream reads time out after 15
seconds and redirects are rejected. Middleware gives authenticated bridge
traffic a separate bounded request budget.

## Verify and roll back

Check that an unauthenticated POST returns 404. With the secret supplied only at
runtime, read a bounded `user_directory` selection and a HEAD count; verify that
a PATCH envelope and an authentication path return 400. Verify that ordinary
homepage traffic still renders from the existing production data source.

To disable bridge access, remove `PUBLIC_READ_SECRET` from production and
redeploy, or revert the bridge deployment. Switch staging back to
`DATA_READ_SOURCE=app` first when it depends on the bridge. No database changes
or data backfills are required.
