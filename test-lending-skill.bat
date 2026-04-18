@echo off
REM Test lending skill directly via API

echo Testing Lending Skill...
echo.

for %%p in (3000 3001 3002 3003) do (
    curl -s "http://localhost:%%p/health" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        set PORT=%%p
        goto :test
    )
)

:test
echo Using API on port %PORT%
echo.

echo Test 1: Request $10 loan (should APPROVE)
echo -------------------------------------------
curl -s -X POST "http://localhost:%PORT%/agent/invoke/sentinel_lending" ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: sentinel_demo_key_2026" ^
  -d "{\"context\":{\"did\":\"did:telegram:5868683829\",\"amount\":10,\"action\":\"evaluate_loan_request\"}}"
echo.
echo.

echo Test 2: Request $600 loan (should DENY - exceeds Tier C limit)
echo ----------------------------------------------------------------
curl -s -X POST "http://localhost:%PORT%/agent/invoke/sentinel_lending" ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: sentinel_demo_key_2026" ^
  -d "{\"context\":{\"did\":\"did:telegram:5868683829\",\"amount\":600,\"action\":\"evaluate_loan_request\"}}"
echo.
echo.

echo ========================================
echo If you see "approve_loan" for $10 and
echo "deny_loan" for $600, then the skill
echo is working correctly!
echo ========================================
pause
