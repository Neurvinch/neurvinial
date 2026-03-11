# Windows PowerShell script to start Sentinel full stack
# Run from: C:\Users\PANDAN\OneDrive\Desktop\neurvinial

Write-Host "🚀 SENTINEL Full Stack Starter" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Kill any existing Node processes on port 3000
Write-Host "🔍 Checking for processes on port 3000..." -ForegroundColor Yellow
$processes = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($processes) {
    Write-Host "⚠️  Found process on port 3000, killing..." -ForegroundColor Yellow
    $pid = $processes.OwningProcess
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "✓ Killed PID $pid" -ForegroundColor Green
}

Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  TERMINAL 1: Backend (Port 3000)                      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Starting Backend API Server..." -ForegroundColor Green
Write-Host "Command: bun run dev`n" -ForegroundColor Gray

# Start backend in new window
$backendParams = @{
    FilePath = "powershell.exe"
    ArgumentList = @("-NoExit", "-Command", "cd 'C:\Users\PANDAN\OneDrive\Desktop\neurvinial'; bun run dev")
    WindowStyle = "Normal"
}
Start-Process @backendParams

Start-Sleep -Seconds 4

Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  TERMINAL 2: Frontend (Port 5173)                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Starting Frontend Dev Server..." -ForegroundColor Green
Write-Host "Command: npm run dev`n" -ForegroundColor Gray

# Start frontend in new window
$frontendParams = @{
    FilePath = "powershell.exe"
    ArgumentList = @("-NoExit", "-Command", "cd 'C:\Users\PANDAN\OneDrive\Desktop\neurvinial\frontend'; npm run dev")
    WindowStyle = "Normal"
}
Start-Process @frontendParams

Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    ✅ READY                           ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "Backend:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "`n🌐 Open: http://localhost:5173 in your browser`n" -ForegroundColor Yellow

Write-Host "To stop: Close both PowerShell windows" -ForegroundColor Gray
