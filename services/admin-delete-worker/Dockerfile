# Long-running worker that consumes private.job_queue. Mirrors the
# services/process_archive/ layout (Node 20 Alpine, app code under /app).
# See services/admin-delete-worker/README.md for deploy notes.
FROM node:20-alpine

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
