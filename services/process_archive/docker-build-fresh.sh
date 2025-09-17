#!/bin/bash

# Build script for process-archive Docker container (fresh build)
set -e

echo "🐳 Building process-archive Docker container (fresh build - no cache)..."

# Build the Docker image from project root with no cache
cd ../../
docker build --no-cache -f services/process_archive/Dockerfile -t process-archive:latest .
cd services/process_archive

echo "✅ Docker image built successfully with fresh dependencies!"
echo ""
echo "To run the container:"
echo "  docker run --env-file=.env -v \$(pwd)/logs:/app/logs process-archive:latest"
echo ""
echo "Or use docker-compose:"
echo "  docker compose run --rm process-archive"
