@echo off
REM Batch script to test Docker container locking mechanism on Windows

echo [TEST] Testing Docker Container Locking Mechanism
echo ==============================================
echo.

REM Check if .env file exists
if not exist ../../.env (
    echo [ERROR] .env file not found! Please create .env file first.
    echo    copy env.example .env
    exit /b 1
)

REM Build the image first
echo [BUILD] Building Docker image...
docker build -f Dockerfile -t process-archive ../../

echo.
echo [START] Starting two containers to test locking...
echo    Starting Container 1, then Container 2
echo.

REM Create logs directory
if not exist logs mkdir logs

REM Start first container in background
echo [RUN] Starting Container 1 (background)...
echo.
echo === Container 1 Output (Background) ===
start /B docker compose run --rm process-archive

REM Wait a moment, then start second container
timeout /t 2 /nobreak >nul
echo.
echo [RUN] Starting Container 2 (foreground)...
echo.
echo === Container 2 Output (Foreground) ===
docker compose run --rm process-archive
echo === Container 2 Finished ===

REM Wait a moment for first container to finish
echo.
echo [WAIT] Waiting for containers to complete...
timeout /t 5 /nobreak >nul

echo.
echo [RESULTS] Test Results:
echo ===============

REM Show the lock file history
if exist logs\process_archive.lock (
    echo [LOCK] Current lock file contents:
    type logs\process_archive.lock
) else (
    echo [SUCCESS] Lock file has been cleaned up
)

echo.
echo [LOGS] Recent execution logs:
if exist logs\execution.log (
    powershell -Command "Get-Content logs\execution.log | Select-Object -Last 10"
) else (
    echo [ERROR] No execution log found
)

echo.
echo [COMPLETE] Locking test completed!
echo    Only ONE container should have acquired the lock successfully
echo    The other should have exited with the locking error message
echo.
pause
