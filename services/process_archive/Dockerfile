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
ENV USE_COPY=true

# Run as root user for simplicity in batch job environment
# Note: This is acceptable for batch jobs/cronjobs where security isolation is less critical

# Use entrypoint script for execution logging
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default command - can be overridden
CMD ["npm", "run", "start"]
