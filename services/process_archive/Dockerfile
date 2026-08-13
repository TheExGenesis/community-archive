# Supabase Realtime requires either a WebSocket transport or Node.js 22+.
# The archive worker only uses Supabase Storage, but createClient still
# initializes Realtime, so keep the runtime on a release with native WebSocket.
FROM node:22-alpine

# Install necessary system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY services/process_archive/package.json services/process_archive/package-lock.json ./

# Install the exact dependency graph committed for this service. A floating
# npm install previously pulled a Supabase version incompatible with Node 20
# and stopped every archive before its Storage download.
RUN npm ci --omit=dev

# Fail the image build if the runtime can no longer construct the Supabase
# client or expose garbage collection as expected by the worker.
COPY services/process_archive/runtime_smoke_test.cjs ./
RUN npm run smoke:runtime

# Copy root package.json for reference (but don't install from it)
COPY package.json ./root-package.json

# Copy the entire project structure (needed for imports from src/utils)
COPY services/process_archive/ ./
COPY src ./src

# Create logs directory
RUN mkdir -p logs

# Copy and make executable the entrypoint script
COPY services/process_archive/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh


# Default environment variables
ENV LOG_LEVEL=info
ENV PG_BATCH_SIZE=1000
ENV MEMORY_BATCH_SIZE=3000
ENV MAX_MEMORY_MB=2000

# Run as root user for simplicity in batch job environment
# Note: This is acceptable for batch jobs/cronjobs where security isolation is less critical

# Use entrypoint script for execution logging
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default command - can be overridden
CMD ["npm", "run", "start"]
