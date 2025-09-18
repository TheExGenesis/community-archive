#!/bin/bash

# Run script for process-archive Docker container (one-time execution)
set -e

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please copy env.example to .env and configure your environment variables."
    exit 1
fi

echo "🚀 Running process-archive job..."

# Create logs and data directories if they don't exist
mkdir -p logs data

# Since container runs as root, ensure directories are accessible
chmod 755 logs data 2>/dev/null || true

# Clean up any existing container
docker rm -f process-archive-service 2>/dev/null || true

# Run with docker compose (recommended for one-time execution)
if [ -f docker-compose.yml ]; then
    echo "Using docker compose run..."
    docker compose run --rm process-archive
    EXIT_CODE=$?
    
    echo ""
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Job completed successfully!"
    else
        echo "❌ Job failed with exit code $EXIT_CODE"
    fi
    
    echo ""
    echo "View execution log:"
    echo "  tail -f logs/execution.log"
    echo ""
    echo "View application logs:"
    echo "  tail -f logs/process_archive.log"
else
    # Fallback to direct docker run
    echo "Using direct docker run..."
    docker run --rm \
        --name process-archive-service \
        --env-file=.env \
        -v "$(pwd)/logs:/app/logs" \
        -v "$(pwd)/data:/app/data" \
        process-archive:latest
    
    EXIT_CODE=$?
    
    echo ""
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Job completed successfully!"
    else
        echo "❌ Job failed with exit code $EXIT_CODE"
    fi
fi

exit $EXIT_CODE
