#!/bin/bash

# Cronjob runner for process-archive Docker container
# This script is designed to be called by cron and handles all logging

# Set strict error handling
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Redirect all output to a cron-specific log
CRON_LOG="logs/cron.log"
mkdir -p logs data

# Since container runs as root, ensure directories are accessible
chmod 755 logs data 2>/dev/null || true

# Function to log with timestamp
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$CRON_LOG"
}

# Start logging
log_with_timestamp "🚀 Cron job starting process-archive"
log_with_timestamp "Working directory: $PWD"

# Check if .env file exists
if [ ! -f .env ]; then
    log_with_timestamp "❌ .env file not found!"
    log_with_timestamp "Please copy env.example to .env and configure your environment variables."
    exit 1
fi

# Clean up any existing container (in case of previous failures)
if docker ps -a --format 'table {{.Names}}' | grep -q '^process-archive-service$'; then
    log_with_timestamp "🧹 Cleaning up existing container"
    docker rm -f process-archive-service 2>/dev/null || true
fi

# Run the job
log_with_timestamp "▶️  Executing process-archive job"

if [ -f docker-compose.yml ]; then
    # Use docker compose run (preferred)
    docker compose run --rm process-archive 2>&1 | while IFS= read -r line; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $line" | tee -a "$CRON_LOG"
    done
    EXIT_CODE=${PIPESTATUS[0]}
else
    # Fallback to direct docker run
    docker run --rm \
        --name process-archive-service \
        --env-file=.env \
        -v "$(pwd)/logs:/app/logs" \
        -v "$(pwd)/data:/app/data" \
        process-archive:latest 2>&1 | while IFS= read -r line; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $line" | tee -a "$CRON_LOG"
    done
    EXIT_CODE=${PIPESTATUS[0]}
fi

# Log completion
if [ $EXIT_CODE -eq 0 ]; then
    log_with_timestamp "✅ Cron job completed successfully"
else
    log_with_timestamp "❌ Cron job failed with exit code $EXIT_CODE"
fi

log_with_timestamp "📊 Log files available:"
log_with_timestamp "  - Cron log: $CRON_LOG"
log_with_timestamp "  - Execution log: logs/execution.log"
log_with_timestamp "  - Application log: logs/process_archive.log"
log_with_timestamp "---"

exit $EXIT_CODE
