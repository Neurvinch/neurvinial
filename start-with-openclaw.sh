#!/bin/bash
# Start Sentinel with OpenClaw Gateway

echo "🚀 Starting Sentinel + OpenClaw Gateway"
echo ""

# Check if MongoDB is accessible
echo "1️⃣ Checking MongoDB connection..."
echo "   ✅ DNS fix applied (Google DNS + IPv4)"
echo "   ✅ MongoDB should connect automatically"
echo ""

# Check if OpenClaw is installed
if ! command -v openclaw &> /dev/null; then
    echo "❌ OpenClaw not installed!"
    echo "   Run: npm install -g openclaw@latest"
    exit 1
fi

echo "✅ OpenClaw $(openclaw --version) installed"
echo ""

# Start Sentinel API
echo "2️⃣ Starting Sentinel API on port 3000..."
npm start &
API_PID=$!
echo "   Sentinel API PID: $API_PID"
echo ""

# Wait for API to start
sleep 5

# Start OpenClaw Gateway
echo "3️⃣ Starting OpenClaw Gateway on port 18789..."
echo "   📱 Telegram bot enabled!"
echo "   🔐 Using pairing mode for security"
echo ""
echo "4️⃣ To approve users:"
echo "   openclaw pairing list telegram"
echo "   openclaw pairing approve telegram <CODE>"
echo ""

openclaw gateway --verbose

# Cleanup on exit
trap "kill $API_PID" EXIT
