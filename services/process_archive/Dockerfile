# Use Node.js 20 LTS with Alpine for better performance and --env-file support
FROM node:20-alpine

# Install necessary system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY services/process_archive/package.json ./

# Install dependencies for this service only
RUN npm install

# Copy root package.json for reference (but don't install from it)
COPY package.json ./root-package.json

# Copy the entire project structure (needed for imports from src/utils)
COPY services/process_archive/ ./
COPY src ./src
COPY database.types.ts ./database.types.ts
COPY .env .env

# The worker imports `../../src/utils/supabaseConfig` (shared with the Next.js
# app). Locally that resolves from services/process_archive/, but the Dockerfile
# flattens the worker into /app/, so we mirror the worker source under the
# expected nested path. The CMD below runs the file via this nested path so
# Node/tsx resolves the relative import to /app/src.
RUN mkdir -p /app/services/process_archive \
 && cp /app/process_archive_upload.ts /app/services/process_archive/process_archive_upload.ts

# Create logs directory
RUN mkdir -p logs

# Copy and make executable the entrypoint script
COPY services/process_archive/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh


# Default environment variables
ENV LOG_LEVEL=info
ENV PG_BATCH_SIZE=5000
ENV MEMORY_BATCH_SIZE=15000
ENV MAX_MEMORY_MB=2000

# Run as root user for simplicity in batch job environment
# Note: This is acceptable for batch jobs/cronjobs where security isolation is less critical

# Use entrypoint script for execution logging
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default command - can be overridden.
# Run the worker via its repo-relative path so relative imports
# (e.g. `../../src/utils/supabaseConfig`) resolve the same way as locally.
# We invoke tsx directly (rather than `npm run start`) because npm scripts
# are run from the package.json's directory (here, /app), and tsx resolves
# the entry file relative to its own CWD — we want the entry file at
# /app/services/process_archive/process_archive_upload.ts so its imports
# resolve to /app/src. --expose-gc preserves the manual GC hooks the worker
# code calls (see `global.gc?.()` sites in process_archive_upload.ts).
ENV NODE_OPTIONS=--expose-gc
CMD ["npx", "tsx", "--env-file=/app/.env", "/app/services/process_archive/process_archive_upload.ts"]
