#!/bin/bash

# Build script for process-archive Docker container
set -e

echo "🐳 Building process-archive Docker container..."

# Build the Docker image from project root
cd ../../
docker build -f services/process_archive/Dockerfile -t process-archive:latest .
cd services/process_archive

echo "✅ Docker image built successfully!"
echo ""
echo "To run the container:"
echo "  docker run --env-file=.env -v \$(pwd)/logs:/app/logs process-archive:latest"
echo ""
echo "Or use docker-compose:"
echo "  docker-compose up -d"
