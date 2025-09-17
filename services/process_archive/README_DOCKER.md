# Docker Setup for Process Archive Service

This document explains how to run the `@process_archive/` service using Docker for **cronjob execution**.

> **Note**: This service is designed for one-time execution (cronjobs), not as a persistent daemon. It connects to **Supabase** for database operations.

## Quick Start

1. **Copy environment template:**
   ```bash
   cp env.example .env
   ```

2. **Configure your environment variables** (see [Configuration](#configuration) below)

3. **Build and run once:**
   ```bash
   # Build the image
   docker build -t process-archive .
   
   # Run once (recommended for cronjobs)
   docker-compose run --rm process-archive
   
   # Or use the helper script
   ./docker-run.sh
   ```

4. **View logs:**
   ```bash
   # Application logs
   tail -f logs/process_archive.log
   
   # Execution tracking logs
   tail -f logs/execution.log
   ```

## Configuration

### Required Environment Variables

Copy `env.example` to `.env` and configure these **required** variables:

```bash
# Supabase PostgreSQL connection (REQUIRED)
POSTGRES_CONNECTION_STRING=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# Supabase configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE=your-service-role-key
```

> **Supabase Connection**: Get your connection string from Supabase Dashboard → Settings → Database → Connection string

### Optional Performance Tuning

```bash
# Logging level
LOG_LEVEL=info

# Batch sizes (for COPY optimization)
PG_BATCH_SIZE=5000
MEMORY_BATCH_SIZE=15000
MAX_MEMORY_MB=1000
USE_COPY=true

# Development mode
DEV_ARCHIVE_PATH=/path/to/test/archive.json
```

## Execution Options

### Option 1: Docker Compose Run (Recommended)

**Benefits:**
- Clean one-time execution
- Automatic cleanup with `--rm`
- Easy configuration management
- Connects to Supabase

```bash
# Build and run once
docker build -t process-archive .
docker compose run --rm process-archive

# Or use npm script
npm run docker:run
```

### Option 2: Direct Docker Run

```bash
# Build image
docker build -t process-archive .

# Run once and remove
docker run --rm \
  --name process-archive-service \
  --env-file=.env \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/data:/app/data" \
  process-archive:latest
```

### Option 3: Helper Scripts

```bash
# Make scripts executable (Linux/Mac)
chmod +x docker-build.sh docker-run.sh cronjob-run.sh

# Build image
./docker-build.sh

# Run once
./docker-run.sh

# For cronjobs (with enhanced logging)
./cronjob-run.sh
```

## Cronjob Setup

### Using the Cronjob Script

The `cronjob-run.sh` script is specifically designed for cron execution:

```bash
# Add to crontab (example: run every hour)
0 * * * * cd /path/to/services/process_archive && ./cronjob-run.sh

# Or run daily at 2 AM
0 2 * * * cd /path/to/services/process_archive && ./cronjob-run.sh
```

### Cronjob Features

- **Enhanced logging**: All output captured to `logs/cron.log`
- **Automatic cleanup**: Removes containers after execution
- **Error handling**: Proper exit codes for cron monitoring
- **Timestamp logging**: All log entries include timestamps

## Service Versions

The Docker container supports multiple processing versions:

| Version | File | Description |
|---------|------|-------------|
| **Default** | `process_archive_upload.ts` | **COPY-optimized** (10x-50x faster) |
| Original | `process.ts` | Original batch processing |
| Streaming | `process_stream.ts` | Memory-efficient streaming |

To use a different version, modify the `CMD` in `Dockerfile`:

```dockerfile
# For original version
CMD ["npm", "run", "start:original"]

# For streaming version  
CMD ["npm", "run", "start:stream"]

# For COPY-optimized (default)
CMD ["npm", "run", "start:copy"]
```

## Logging System

The service provides **three types of logs** without requiring code changes:

### Log Files

| File | Purpose | Content |
|------|---------|---------|
| `logs/process_archive.log` | **Application logs** | Service execution details, database operations |
| `logs/execution.log` | **Execution tracking** | Start/end times, exit codes, performance metrics |
| `logs/cron.log` | **Cronjob logs** | Cron-specific output with timestamps |

### Log Monitoring

```bash
# View application logs
tail -f logs/process_archive.log

# View execution tracking
tail -f logs/execution.log

# View cron logs
tail -f logs/cron.log

# View all logs
tail -f logs/*.log
```

## Volume Mounts

The container uses these volume mounts for persistence:

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./logs` | `/app/logs` | **Persistent logging** (all 3 log types) |
| `./data` | `/app/data` | Archive data files |
| `./.env` | `/app/.env` | Environment configuration |

## Resource Requirements

### Minimum Requirements
- **Memory:** 512MB
- **CPU:** 0.5 cores
- **Storage:** 1GB for logs

### Recommended for Large Archives
- **Memory:** 2GB+ 
- **CPU:** 1+ cores
- **Storage:** 10GB+ for logs

The `docker-compose.yml` includes resource limits:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '1.0'
    reservations:
      memory: 512M
      cpus: '0.5'
```

## Performance Optimization

### Memory Management
- **Garbage Collection:** Enabled by default with `--expose-gc`
- **Memory Limit:** Set via `MAX_MEMORY_MB` environment variable
- **Batch Sizes:** Tune `PG_BATCH_SIZE` and `MEMORY_BATCH_SIZE`

### Database Performance
- **COPY Optimization:** Enabled by default (`USE_COPY=true`)
- **Connection Pooling:** Max 5 connections
- **Batch Processing:** Optimized batch sizes

### Monitoring
- **Health Checks:** Built-in container health monitoring
- **Log Rotation:** Automatic log rotation (50 files × 10MB)
- **Memory Tracking:** Real-time memory usage logging

## Troubleshooting

### Common Issues

1. **Container won't start:**
   ```bash
   # Check logs
   docker-compose logs process-archive
   
   # Verify environment variables
   docker-compose config
   ```

2. **Database connection failed:**
   ```bash
   # Test connection from container
   docker-compose exec process-archive node -e "
   const postgres = require('postgres');
   const sql = postgres(process.env.POSTGRES_CONNECTION_STRING);
   sql\`SELECT 1\`.then(() => console.log('✅ Connected')).catch(console.error);
   "
   ```

3. **Out of memory errors:**
   ```bash
   # Increase memory limit
   echo "MAX_MEMORY_MB=2000" >> .env
   docker-compose restart process-archive
   ```

4. **Permission issues:**
   ```bash
   # Fix log directory permissions
   chmod 755 logs/
   chown -R 1001:1001 logs/
   ```

### Debug Mode

Run with debug logging:

```bash
# Set debug level
echo "LOG_LEVEL=debug" >> .env
docker-compose restart process-archive

# Follow debug logs
docker-compose logs -f process-archive
```

## Production Deployment

### Security Considerations

1. **Non-root user:** Container runs as `nodejs` user (UID 1001)
2. **Environment secrets:** Use Docker secrets or external secret management
3. **Network security:** Use private networks for database connections
4. **Resource limits:** Set appropriate CPU/memory limits

### High Availability

```yaml
# docker-compose.yml for HA
services:
  process-archive:
    restart: unless-stopped
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
```

### Monitoring Integration

```yaml
# Add monitoring labels
services:
  process-archive:
    labels:
      - "prometheus.io/scrape=true"
      - "prometheus.io/port=3000"
```

## Development

### Local Development with Docker

```bash
# Use local database
echo "POSTGRES_CONNECTION_STRING=postgresql://postgres:password@host.docker.internal:5432/community_archive" >> .env

# Mount source code for development
docker run -v "$(pwd):/app" -v "$(pwd)/node_modules:/app/node_modules" process-archive npm run dev
```

### Building from Different Architectures

```bash
# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t process-archive .
```

## Support

For issues and questions:
1. Check the logs: `docker-compose logs -f process-archive`
2. Review the [COPY Optimization documentation](README_COPY_OPTIMIZATION.md)
3. Verify your environment configuration
4. Check database connectivity

## NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run docker:build` | Build Docker image |
| `npm run docker:run` | Run once with docker-compose |
| `npm run docker:run-direct` | Run once with direct docker command |
| `npm run docker:logs` | View application logs |
| `npm run docker:exec-logs` | View execution tracking logs |

## Example Cronjob Usage

### Complete Setup Example

```bash
# 1. Initial setup
cd /path/to/services/process_archive
cp env.example .env
# Edit .env with your Supabase credentials

# 2. Build the image
docker build -t process-archive .

# 3. Test run
./docker-run.sh

# 4. Add to crontab for daily execution
echo "0 2 * * * cd /path/to/services/process_archive && ./cronjob-run.sh" | crontab -

# 5. Monitor logs
tail -f logs/execution.log
```

### Log Output Examples

**Execution Log (`logs/execution.log`):**
```
[2024-01-15 02:00:01] Starting process-archive execution
[2024-01-15 02:00:01] Command: npm run start
[2024-01-15 02:00:01] Environment: NODE_ENV=production
[2024-01-15 02:00:01] Memory limit: 2000MB
[2024-01-15 02:00:01] Use COPY optimization: true
[2024-01-15 02:00:01] Batch size: 5000
[2024-01-15 02:05:23] ✅ Process completed successfully in 322s
[2024-01-15 02:05:23] ---
```

**Cron Log (`logs/cron.log`):**
```
[2024-01-15 02:00:00] 🚀 Cron job starting process-archive
[2024-01-15 02:00:00] Working directory: /path/to/services/process_archive
[2024-01-15 02:00:01] ▶️  Executing process-archive job
[2024-01-15 02:05:23] ✅ Cron job completed successfully
[2024-01-15 02:05:23] 📊 Log files available:
[2024-01-15 02:05:23]   - Cron log: logs/cron.log
[2024-01-15 02:05:23]   - Execution log: logs/execution.log
[2024-01-15 02:05:23]   - Application log: logs/process_archive.log
[2024-01-15 02:05:23] ---
```
