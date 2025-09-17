#!/bin/bash

# Manual cleanup script for process-archive container lock files
# Use this if you need to manually remove stale lock files created by the Docker container

LOCK_FILE="logs/process_archive.lock"

echo "🧹 Process Archive Container Lock Cleanup"
echo "=========================================="

if [ -f "$LOCK_FILE" ]; then
    LOCK_CONTENT=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_CONTENT" ]; then
        LOCK_CONTAINER_ID=$(echo "$LOCK_CONTENT" | cut -d'|' -f1 2>/dev/null || echo "")
        LOCK_TIMESTAMP=$(echo "$LOCK_CONTENT" | cut -d'|' -f2 2>/dev/null || echo "0")
        
        if [ -n "$LOCK_CONTAINER_ID" ]; then
            echo "Lock held by container: $LOCK_CONTAINER_ID"
            
            if [ "$LOCK_TIMESTAMP" != "0" ]; then
                CURRENT_TIME=$(date +%s)
                LOCK_AGE=$((CURRENT_TIME - LOCK_TIMESTAMP))
                echo "Lock age: ${LOCK_AGE} seconds ($(date -d "@$LOCK_TIMESTAMP" 2>/dev/null || echo "unknown time"))"
            fi
            
            echo ""
            echo "ℹ️  Check if any process-archive containers are running:"
            echo "   docker ps --filter name=process-archive"
            echo "   docker ps --filter ancestor=process-archive"
        else
            echo "Lock file format unrecognized: $LOCK_CONTENT"
        fi
    fi
    
    echo ""
    echo "Removing container lock file..."
    rm -f "$LOCK_FILE"
    
    if [ -f "$LOCK_FILE" ]; then
        echo "❌ Failed to remove lock file"
        exit 1
    else
        echo "✅ Container lock file removed successfully"
    fi
else
    echo "✅ No container lock files found"
fi

echo ""
echo "You can now run the process-archive service:"
echo "  ./docker-run.sh"
echo "  or"
echo "  ./cronjob-run.sh"
