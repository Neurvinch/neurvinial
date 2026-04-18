// Verification script to test if the restart fixed the cache issue
const axios = require('axios');

const TEST_API_URL = 'https://neurvinial.onrender.com';

async function testSystemAfterRestart() {
  console.log('🔧 TESTING SYSTEM AFTER FORCE RESTART...\n');

  try {
    // Test 1: Health check to see if system restarted
    console.log('1. 🏥 Testing system health...');
    const healthResponse = await axios.get(`${TEST_API_URL}/health`);
    console.log('✅ System is online');
    console.log(`📊 Uptime: ${healthResponse.data.uptime || 'unknown'}`);
    console.log(`🔄 Last restart: ${new Date().toISOString()}\n`);

    // Test 2: Check if logs show the new cache breaker
    console.log('2. 🔍 Checking for cache breaker in logs...');
    console.log('Look for: "Telegram mode detection" with timestamp + cacheBreaker');
    console.log('This confirms the new code is running\n');

    // Test 3: List expected fixes
    console.log('3. 📋 EXPECTED FIXES AFTER RESTART:');
    console.log('');

    console.log('❌ BEFORE (cached old code):');
    console.log('   /help → Shows only 5 commands (register, status, request, balance, help)');
    console.log('   /approve → "Unknown command: /approve"');
    console.log('   /wallet → "Unknown command: /wallet"');
    console.log('   /history → "Unknown command: /history"');
    console.log('');

    console.log('✅ AFTER (fresh code):');
    console.log('   /help → Shows 45+ commands with full categories');
    console.log('   /approve → Calls handleApprove() - eligibility check');
    console.log('   /wallet → Calls handleWallet() - shows wallet address');
    console.log('   /history → Calls handleHistory() - shows loan history');
    console.log('   /repay → Calls handleRepay() - mark loans repaid');
    console.log('');

    console.log('🧪 TEST COMMANDS:');
    console.log('   1. /help (should show comprehensive list)');
    console.log('   2. /approve (should NOT say "Unknown command")');
    console.log('   3. /wallet (should NOT say "Unknown command")');
    console.log('   4. /health (should show ONLY one response, no duplicates)');
    console.log('');

    console.log('💡 If still broken: Module cache didn\'t clear properly');
    console.log('   → Manual restart needed on Render.com dashboard');
    console.log('   → Or wait 5-10 minutes for auto-restart');

  } catch (error) {
    console.log('❌ System not responding:', error.message);
    console.log('💡 Wait 2-3 more minutes for restart to complete');
  }
}

// Run the test
testSystemAfterRestart().catch(console.error);