@echo off
REM ============================================
REM SENTINEL - Clean Restart Script
REM ============================================
REM This script completely stops all Node instances
REM and starts a fresh SENTINEL API with Telegram bot

echo ========================================
echo SENTINEL Clean Restart
echo ========================================
echo.

echo Step 1: Killing all Node processes...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   ✓ Stopped running instances
) else (
    echo   ℹ No instances running
)
timeout /t 3 /nobreak >nul
echo.

echo Step 2: Starting SENTINEL...
cd /d "%~dp0"
start "SENTINEL API" cmd /k "npm start"
timeout /t 10 /nobreak >nul
echo   ✓ API starting...
echo.

echo Step 3: Checking status...
for %%p in (3000 3001 3002 3003) do (
    curl -s "http://localhost:%%p/health" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo   ✅ API running on port %%p
        curl -s "http://localhost:%%p/health"
        goto :found
    )
)
echo   ⚠️ API not responding yet, check the window
:found

echo.
echo ========================================
echo ✅ Restart Complete!
echo ========================================
echo.
echo Your Telegram bot is now ready:
echo   • Send /request 10 to test
echo   • API will use updated lending skill
echo   • Only ONE bot instance running
echo.
pause
