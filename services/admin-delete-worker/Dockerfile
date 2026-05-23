# Long-running worker that consumes private.admin_jobs. Mirrors the
# services/process_archive/ layout, but pinned to Node 22 — Node 20
# ships without a native `WebSocket` global, and `@supabase/supabase-js`
# >= 2.46 crashes at `createClient(...)` time with
# "Node.js 20 detected without native WebSocket support".
# Node 22 has WebSocket natively; do NOT downgrade without also pinning
# supabase-js to a version that ships its own ws polyfill.
FROM node:22-alpine

# tini for proper SIGTERM forwarding into the Node process — without
# it, `docker stop` sends SIGTERM to PID 1 (Node), but Node's signal
# handling under a missing init can drop signals during certain
# library initializations. tini sidesteps all of that.
RUN apk add --no-cache tini && rm -rf /var/cache/apk/*

WORKDIR /app

# Install the service's own deps first so this layer caches.
COPY services/admin-delete-worker/package.json ./
RUN npm install --no-audit --no-fund

# Copy the service source. (We deliberately don't COPY the repo root —
# this service stands alone, doesn't reuse the Next.js code.)
COPY services/admin-delete-worker/ ./

ENV NODE_ENV=production
ENV LOG_LEVEL=info

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/index.ts"]
