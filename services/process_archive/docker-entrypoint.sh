#!/bin/bash
set -e

# Create logs directory if it doesn't exist and ensure proper permissions
mkdir -p /app/logs
chmod 755 /app/logs

# Lock file to prevent multiple container instances
LOCK_FILE="/app/logs/process_archive.lock"
CONTAINER_ID=$(hostname)
TIMESTAMP=$(date +%s)

# Function to cleanup lock file
cleanup_lock() {
    if [ -f "$LOCK_FILE" ]; then
        # Only remove lock if it belongs to this container
        if [ -f "$LOCK_FILE" ] && grep -q "$CONTAINER_ID" "$LOCK_FILE" 2>/dev/null; then
            rm -f "$LOCK_FILE"
        fi
    fi
}

# Trap to ensure cleanup on exit
trap cleanup_lock EXIT INT TERM

# Atomic lock acquisition using flock
exec 200>"$LOCK_FILE"

if ! flock -n 200; then
    echo "❌ Another process-archive container is currently acquiring/holding the lock"
    echo "   Lock file: $LOCK_FILE"
    echo "   Container will exit to prevent concurrent execution"
    exit 1
fi

# Now we have exclusive access - check if there's existing lock content
LOCK_CONTENT=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
if [ -n "$LOCK_CONTENT" ]; then
    LOCK_CONTAINER_ID=$(echo "$LOCK_CONTENT" | cut -d'|' -f1 2>/dev/null || echo "")
    LOCK_TIMESTAMP=$(echo "$LOCK_CONTENT" | cut -d'|' -f2 2>/dev/null || echo "0")
    
    if [ -n "$LOCK_CONTAINER_ID" ] && [ "$LOCK_CONTAINER_ID" != "$CONTAINER_ID" ]; then
        # Check if the lock is stale (older than 12 hours = 43200 seconds)
        CURRENT_TIME=$(date +%s)
        LOCK_AGE=$((CURRENT_TIME - LOCK_TIMESTAMP))
        
        if [ "$LOCK_AGE" -gt 43200 ]; then
            echo "⚠️  Stale lock file found (${LOCK_AGE}s old), taking over..."
        else
            echo "❌ Another process-archive container is already running"
            echo "   Container ID: $LOCK_CONTAINER_ID" 
            echo "   Lock file: $LOCK_FILE"
            echo "   Lock age: ${LOCK_AGE}s"
            echo "   Container will exit to prevent concurrent execution"
            exit 1
        fi
    elif [ "$LOCK_CONTAINER_ID" = "$CONTAINER_ID" ]; then
        echo "⚠️  Found lock from same container (restart?), updating..."
    fi
fi

# Write our lock information
echo "${CONTAINER_ID}|${TIMESTAMP}" > "$LOCK_FILE"
echo "🔒 Container lock acquired (Container: $CONTAINER_ID, Lock: $LOCK_FILE)"

# Keep the flock fd open for the duration of the script
# fd 200 will be automatically closed when the script exits

# Execution log file
EXEC_LOG="/app/logs/execution.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
START_TIME=$(date +%s)

# Create log file with proper permissions if it doesn't exist
touch "$EXEC_LOG" 2>/dev/null || {
    echo "Warning: Cannot create execution log file, logging to stdout only"
    EXEC_LOG="/dev/stdout"
}

# Log execution start
echo "[$TIMESTAMP] Starting process-archive execution" >> "$EXEC_LOG"
echo "[$TIMESTAMP] Command: $@" >> "$EXEC_LOG"
echo "[$TIMESTAMP] Environment: NODE_ENV=${NODE_ENV:-production}" >> "$EXEC_LOG"
echo "[$TIMESTAMP] Memory limit: ${MAX_MEMORY_MB:-2000}MB" >> "$EXEC_LOG"
echo "[$TIMESTAMP] Use COPY optimization: ${USE_COPY:-true}" >> "$EXEC_LOG"
echo "[$TIMESTAMP] Batch size: ${PG_BATCH_SIZE:-5000}" >> "$EXEC_LOG"

# Function to log completion and cleanup
log_completion() {
    local exit_code=$1
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    local end_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    if [ $exit_code -eq 0 ]; then
        echo "[$end_timestamp] ✅ Process completed successfully in ${duration}s" >> "$EXEC_LOG"
    else
        echo "[$end_timestamp] ❌ Process failed with exit code $exit_code after ${duration}s" >> "$EXEC_LOG"
    fi
    echo "[$end_timestamp] 🔓 Releasing container lock" >> "$EXEC_LOG"
    echo "[$end_timestamp] ---" >> "$EXEC_LOG"
    
    # Cleanup will be handled by the trap function
}

# Trap to ensure completion is logged even if the script is interrupted
trap 'log_completion $?' EXIT

# Execute the main command
exec "$@"
