# Deployment Guide - Process Archive Service

This guide walks you through deploying the process_archive service to a server for cronjob execution.

## Prerequisites

- **Server with Docker installed** (Linux/Ubuntu recommended)
- **Supabase project** with database access
- **SSH access** to your server
- **Git** (for code deployment)

## Step 1: Server Setup

### Install Docker (Ubuntu/Debian)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (avoid sudo)
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Logout and login again for group changes to take effect
exit
```

### Verify Docker Installation

```bash
# Test Docker
docker --version

# Test Docker Compose
docker compose version

# Test Docker without sudo
docker run hello-world
```

## Step 2: Deploy Code to Server

### Option A: Git Clone (Recommended)

```bash
# Clone your repository
git clone https://github.com/your-username/your-repo.git
cd your-repo/services/process_archive

# Or if deploying from a specific branch
git clone -b your-branch https://github.com/your-username/your-repo.git
```

### Option B: SCP/SFTP Upload

```bash
# From your local machine
scp -r services/process_archive user@your-server:/home/user/
```

### Option C: Manual Upload

Upload the entire `services/process_archive/` directory to your server.

## Step 3: Environment Configuration

### Get Supabase Credentials

1. **Go to your Supabase Dashboard**
2. **Settings → Database → Connection string**
   - Copy the PostgreSQL connection string
3. **Settings → API**
   - Copy Project URL, anon key, and service role key

### Configure Environment

```bash
cd /path/to/services/process_archive

# Copy environment template
cp env.example .env

# Edit environment file
nano .env
```

**Fill in your `.env` file:**
```bash
# Supabase Database Configuration (REQUIRED)
POSTGRES_CONNECTION_STRING=postgresql://postgres:[YOUR_PASSWORD]@db.[YOUR_PROJECT_REF].supabase.co:5432/postgres

# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR_PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Performance Configuration (OPTIONAL)
LOG_LEVEL=info
PG_BATCH_SIZE=5000
MEMORY_BATCH_SIZE=15000
MAX_MEMORY_MB=2000
USE_COPY=true

NODE_ENV=production

# Docker-specific Configuration (OPTIONAL)
ARCHIVE_DATA_PATH=./data
```

### Secure Your Environment File

```bash
# Set proper permissions
chmod 600 .env

# Verify only you can read it
ls -la .env
# Should show: -rw------- 1 user user
```

## Step 4: Build and Test

### Build Docker Image

```bash
# Build the image (builds from project root)
./docker-build.sh

# Or manually from the process_archive directory:
cd ../../
docker build -f services/process_archive/Dockerfile -t process-archive .
cd services/process_archive

# Or use npm script:
npm run docker:build
```

> **Note**: The Docker build context is set to the project root to access `src/` and `database.types.ts` files.

### Test Run

```bash
# Test the service
./docker-run.sh

# Check logs
tail -f logs/execution.log
tail -f logs/process_archive.log
```

**Expected output in `logs/execution.log`:**
```
[2024-01-15 14:30:01] Starting process-archive execution
[2024-01-15 14:30:01] Command: npm run start
[2024-01-15 14:30:01] Environment: NODE_ENV=production
[2024-01-15 14:30:01] Memory limit: 2000MB
[2024-01-15 14:30:01] Use COPY optimization: true
[2024-01-15 14:30:01] Batch size: 5000
[2024-01-15 14:35:23] ✅ Process completed successfully in 322s
[2024-01-15 14:35:23] ---
```

## Step 5: Setup Cronjob

### Test Cronjob Script

```bash
# Test the cronjob script manually
./cronjob-run.sh

# Check all log files were created
ls -la logs/
# Should show: cron.log, execution.log, process_archive.log
```

### Add to Crontab

```bash
# Edit crontab
crontab -e

# Add your cronjob (example: daily at 2 AM)
0 2 * * * cd /home/user/services/process_archive && ./cronjob-run.sh

# Or hourly
0 * * * * cd /home/user/services/process_archive && ./cronjob-run.sh

# Or every 6 hours
0 */6 * * * cd /home/user/services/process_archive && ./cronjob-run.sh
```

### Verify Crontab

```bash
# List current crontabs
crontab -l

# Check cron service is running
sudo systemctl status cron
```

## Step 6: Monitoring Setup

### Create Log Rotation

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/process-archive
```

**Add this content:**
```
/home/user/services/process_archive/logs/*.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
    create 644 user user
    postrotate
        # Optional: restart any services if needed
    endscript
}
```

### Setup Log Monitoring

```bash
# Create monitoring script
nano monitor-logs.sh
```

**Add this content:**
```bash
#!/bin/bash
LOG_DIR="/home/user/services/process_archive/logs"

echo "=== Process Archive Service Status ==="
echo "Last execution: $(tail -n 1 $LOG_DIR/execution.log | cut -d']' -f1 | tr -d '[')"
echo ""

echo "=== Recent Executions ==="
tail -n 10 $LOG_DIR/execution.log

echo ""
echo "=== Recent Errors ==="
grep -i error $LOG_DIR/process_archive.log | tail -n 5

echo ""
echo "=== Disk Usage ==="
du -sh $LOG_DIR/*
```

```bash
chmod +x monitor-logs.sh
```

## Step 7: Testing & Validation

### Manual Testing

```bash
# 1. Test direct run
./docker-run.sh

# 2. Test cronjob script
./cronjob-run.sh

# 3. Check all logs are created
ls -la logs/

# 4. Verify log content
tail logs/execution.log
tail logs/cron.log
tail logs/process_archive.log
```

### Simulate Cronjob

```bash
# Run as if from cron (minimal environment)
env -i HOME="$HOME" PATH="/usr/bin:/bin" bash -c "cd $(pwd) && ./cronjob-run.sh"
```

### Database Connection Test

```bash
# Test database connection
docker run --rm --env-file=.env process-archive node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_CONNECTION_STRING);
sql\`SELECT 1 as test\`.then(result => {
  console.log('✅ Database connected:', result);
  process.exit(0);
}).catch(error => {
  console.error('❌ Database error:', error.message);
  process.exit(1);
});
"
```

## Step 8: Production Optimizations

### System Resources

```bash
# Check available resources
free -h
df -h
docker system df
```

### Docker Cleanup (Setup Auto-cleanup)

```bash
# Create cleanup script
nano docker-cleanup.sh
```

**Add this content:**
```bash
#!/bin/bash
# Clean up Docker resources weekly

echo "Cleaning up Docker resources..."
docker system prune -f
docker image prune -f
docker volume prune -f

echo "Docker cleanup completed"
```

```bash
chmod +x docker-cleanup.sh

# Add to crontab (weekly cleanup)
echo "0 3 * * 0 cd /home/user/services/process_archive && ./docker-cleanup.sh" | crontab -
```

### Security Hardening

```bash
# Secure the directory
chmod 750 /home/user/services/process_archive

# Secure log files
chmod 640 logs/*.log

# Secure environment file
chmod 600 .env
```

## Step 9: Monitoring & Alerts

### Simple Email Alerts (Optional)

```bash
# Install mail utility
sudo apt install mailutils -y

# Create alert script
nano alert-on-failure.sh
```

**Add this content:**
```bash
#!/bin/bash
LOG_FILE="logs/execution.log"
LAST_LINE=$(tail -n 1 "$LOG_FILE")

if echo "$LAST_LINE" | grep -q "❌"; then
    echo "Process archive failed: $LAST_LINE" | mail -s "Process Archive Failed" your-email@example.com
fi
```

### Update Cronjob with Alerts

```bash
# Edit crontab
crontab -e

# Update to include alert
0 2 * * * cd /home/user/services/process_archive && ./cronjob-run.sh && ./alert-on-failure.sh
```

## Step 10: Backup Strategy

### Backup Logs

```bash
# Create backup script
nano backup-logs.sh
```

**Add this content:**
```bash
#!/bin/bash
BACKUP_DIR="/home/user/backups/process-archive"
SOURCE_DIR="/home/user/services/process_archive/logs"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/logs-$(date +%Y%m%d).tar.gz" -C "$SOURCE_DIR" .

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "logs-*.tar.gz" -mtime +30 -delete
```

## Troubleshooting

### Common Issues

1. **Build context errors (COPY ../../src fails)**
   ```bash
   # Make sure you're building from the correct context
   cd services/process_archive
   ./docker-build.sh
   
   # Or manually:
   cd ../../
   docker build -f services/process_archive/Dockerfile -t process-archive .
   ```

2. **Permission denied on scripts**
   ```bash
   chmod +x *.sh
   ```

3. **Docker permission denied**
   ```bash
   sudo usermod -aG docker $USER
   # Logout and login again
   ```


5. **Environment variables not loaded**
   ```bash
   # Check .env file exists and has correct permissions
   ls -la .env
   cat .env | head -5
   ```

4. **Database connection fails**
   ```bash
   # Test connection string format
   echo $POSTGRES_CONNECTION_STRING
   # Should be: postgresql://postgres:password@db.project.supabase.co:5432/postgres
   ```

5. **Docker Compose command not found**
   ```bash
   # Check if Docker Compose plugin is installed
   docker compose version
   
   # Install if missing
   sudo apt update
   sudo apt install docker-compose-plugin -y
   ```

6. **Cron job not running**
   ```bash
   # Check cron service
   sudo systemctl status cron
   
   # Check cron logs
   sudo tail -f /var/log/cron.log
   ```

### Log Analysis

```bash
# Check for errors
grep -i error logs/*.log

# Check execution times
grep "completed successfully" logs/execution.log

# Check memory usage
grep "Memory" logs/process_archive.log

# Monitor real-time
tail -f logs/*.log
```

## Maintenance

### Regular Tasks

1. **Weekly**: Check logs and clean up old containers
2. **Monthly**: Update Docker images and system packages
3. **Quarterly**: Review and optimize performance settings

### Update Deployment

```bash
# Pull latest changes
git pull origin main

# Rebuild image
docker build -t process-archive .

# Test new version
./docker-run.sh
```

## Success Checklist

- [ ] Docker installed and working
- [ ] Code deployed to server
- [ ] Environment variables configured
- [ ] Docker image builds successfully
- [ ] Test run completes successfully
- [ ] Cronjob added and scheduled
- [ ] All three log files are created
- [ ] Database connection verified
- [ ] Log rotation configured
- [ ] Monitoring setup (optional)
- [ ] Backup strategy implemented (optional)

Your process_archive service is now ready for production! 🚀
