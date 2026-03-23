#!/usr/bin/env bash

# ============================================
# SENTINEL — Quick Start & Deployment Guide
# ============================================
# Complete guide to get Sentinel running
# All mocks removed - production ready!

echo "🚀 SENTINEL — Complete Deployment Guide"
echo "========================================"
echo ""

# Step 1: Environment Check
echo "📋 Step 1: Environment Setup"
echo "----------------------------"

if [ ! -f ".env" ]; then
  echo "⚠️  .env file not found. Creating from .env.example..."
  cp .env.example .env
  echo "✓ Created .env - you may need to edit it with your settings"
else
  echo "✓ .env file exists"
fi

# Check Node version
NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
echo "✓ Node.js: $NODE_VERSION"
echo "✓ npm: $NPM_VERSION"
echo ""

# Step 2: Dependencies
echo "📦 Step 2: Install Dependencies"
echo "-------------------------------"
if [ -d "node_modules" ]; then
  echo "✓ node_modules already exists"
else
  echo "Installing packages..."
  npm install
fi
echo ""

# Step 3: Environment Variables
echo "🔐 Step 3: Required Environment Variables"
echo "----------------------------------------"
echo "Current settings:"
echo ""
if grep -q "^WDK_SEED_PHRASE=" .env; then
  SEED=$(grep "^WDK_SEED_PHRASE=" .env | cut -d'=' -f2 | awk '{print substr($1, 0, 10)}...')
  echo "✓ WDK_SEED_PHRASE configured: $SEED"
else
  echo "⚠️  WDK_SEED_PHRASE not configured"
fi

if grep -q "^MONGODB_URI=" .env; then
  echo "✓ MONGODB_URI configured"
else
  echo "⚠️  MONGODB_URI not configured (optional - uses in-memory store)"
fi

if grep -q "^GROQ_API_KEY=" .env; then
  echo "✓ GROQ_API_KEY configured"
else
  echo "⚠️  GROQ_API_KEY not configured (optional - uses fallback)"
fi

if grep -q "^TELEGRAM_BOT_TOKEN=" .env; then
  echo "✓ TELEGRAM_BOT_TOKEN configured"
else
  echo "⚠️  TELEGRAM_BOT_TOKEN not configured (optional - uses console)"
fi
echo ""

# Step 4: Tests
echo "🧪 Step 4: Run Tests"
echo "-------------------"
echo "Running unit tests..."
npm test 2>&1 | tail -10
echo ""

# Step 5: Info
echo "🎯 Step 5: Sentinel Configuration"
echo "--------------------------------"
echo ""
echo "Your Sentinel Wallet:"
SEED=$(grep "^WDK_SEED_PHRASE=" .env | cut -d'=' -f2)
if [ -n "$SEED" ] && [ "$SEED" != "your twelve word mnemonic seed phrase goes here" ]; then
  node -e "
    const WDK = require('@tetherto/wdk').default || require('@tetherto/wdk');
    const WalletManagerEvm = require('@tetherto/wdk-wallet-evm').default || require('@tetherto/wdk-wallet-evm');
    const seedPhrase = process.env.WDK_SEED_PHRASE;
    const walletManager = new WalletManagerEvm(seedPhrase, 'ethereum', 'sepolia');
    const wallet = walletManager.getWallet(0);
    console.log('  Wallet Address: ' + wallet.address);
    console.log('  Network: Ethereum Sepolia');
    console.log('  RPC: ' + (process.env.WDK_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'));
  " 2>/dev/null || echo "  (WDK initialization required - run with valid seed phrase)"
else
  echo "  (Configure WDK_SEED_PHRASE in .env to see wallet details)"
fi
echo ""

# Step 6: Next Steps
echo "🚀 Step 6: Start Development Server"
echo "----------------------------------"
echo ""
echo "Run the server:"
echo "  npm start"
echo ""
echo "In another terminal, run the demo:"
echo "  node demo-flow.js"
echo ""
echo "Or run the system test:"
echo "  node test-local.js"
echo ""

# Step 7: Deployment
echo "📤 Step 7: Deploy to Production"
echo "------------------------------"
echo ""
echo "For Railway:"
echo "  1. Push to GitHub"
echo "  2. Connect to Railway"
echo "  3. Set environment variables"
echo "  4. Deploy: railway up"
echo ""
echo "For Heroku:"
echo "  1. heroku create sentinel-lending"
echo "  2. heroku config:set WDK_SEED_PHRASE=<your-seed>"
echo "  3. git push heroku main"
echo ""
echo "For AWS:"
echo "  1. Create EC2 instance"
echo "  2. Clone repository"
echo "  3. npm install && npm start"
echo ""

# Step 8: Monitoring
echo "📊 Step 8: Monitoring & Maintenance"
echo "---------------------------------"
echo ""
echo "Check server health:"
echo "  curl http://localhost:3000/health"
echo ""
echo "View logs:"
echo "  tail -f logs/sentinel.log"
echo ""
echo "Start repayment monitor (when MongoDB configured):"
echo "  npm run monitor"
echo ""

# Step 9: Hackathon
echo "🏆 Step 9: Hackathon Submission"
echo "------------------------------"
echo ""
echo "Before submitting to DoraHacks:"
echo ""
echo "Checklist:"
echo "  [ ] WDK_SEED_PHRASE configured"
echo "  [ ] Wallet funded with testnet ETH"
echo "  [ ] Wallet funded with testnet USDT"
echo "  [ ] All 61 tests passing"
echo "  [ ] Server starts without errors"
echo "  [ ] Demo script completes"
echo "  [ ] README.md updated"
echo ""
echo "Submission:"
echo "  1. Push final code to GitHub"
echo "  2. Deploy to production URL"
echo "  3. Submit to: https://dorahacks.io/hackathon/hackathon-galactica-wdk-2026-01"
echo ""
echo "📝 Include in submission:"
echo "  - GitHub repo link"
echo "  - Live demo URL"
echo "  - Wallet address (Sepolia)"
echo "  - Features implemented"
echo "  - How to test"
echo ""

echo "✅ Setup complete! Ready to rock! 🎸"
