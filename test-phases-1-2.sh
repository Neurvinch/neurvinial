#!/bin/bash

echo "🧪 SENTINEL Phase 1-2 Quick Test"
echo "=================================="
echo ""

# Find the correct port
PORT=$(ps aux | grep "node core/index.js" | grep -v grep | head -1 | grep -oP "port \K[0-9]+" || echo "3011")
API_URL="http://localhost:${PORT:-3011}"

echo "✓ Using API URL: $API_URL"
echo ""

# Test 1: Health
echo "Test 1: Health Check"
HEALTH=$(curl -s $API_URL/health)
echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
echo ""

# Test 2: Credit Skill
echo "Test 2: Credit Skill (Groq LLM)"
CREDIT=$(curl -s -X POST $API_URL/agent/invoke/sentinel_credit \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sentinel_demo_key_2026" \
  -d '{"context":{"did":"did:test:alice","action":"assess_creditworthiness"}}')
echo "$CREDIT" | jq '.result' 2>/dev/null || echo "$CREDIT"
echo ""

# Test 3: Lending Skill
echo "Test 3: Lending Skill (Groq LLM)"
LENDING=$(curl -s -X POST $API_URL/agent/invoke/sentinel_lending \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sentinel_demo_key_2026" \
  -d '{"context":{"did":"did:test:bob","amount":500,"action":"evaluate_loan_request"}}')
echo "$LENDING" | jq '.result' 2>/dev/null || echo "$LENDING"
echo ""

# Test 4: WDK Skill
echo "Test 4: WDK Skill (Groq LLM)"
WDK=$(curl -s -X POST $API_URL/agent/invoke/sentinel_wdk \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sentinel_demo_key_2026" \
  -d '{"context":{"did":"did:test:charlie","action":"check_balance"}}')
echo "$WDK" | jq '.result' 2>/dev/null || echo "$WDK"
echo ""

echo "✨ All tests complete!"
