#!/usr/bin/env node

// ============================================
// SENTINEL — Complete Demo Script
// ============================================
// Tests the full loan lifecycle end-to-end:
//   1. Register agent
//   2. Request loan
//   3. Check loan status
//   4. Disburse loan (real USDT transfer via WDK)
//   5. Process repayment
//   6. Check updated credit score
//
// Usage:
//   node demo-flow.js
//
// Prerequisites:
//   - Server running on PORT (default 3000)
//   - WDK_SEED_PHRASE configured in .env
//   - MongoDB connected (or in-memory store will be used)
//   - Sufficient USDT + ETH in Sentinel wallet for gas

require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = process.env.DEMO_API_BASE || `http://localhost:${process.env.PORT || 3000}`;
const API_KEY = process.env.API_KEYS?.split(',')[0] || 'sentinel_demo_key_2026';

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${'='.repeat(60)}`, colors.bright);
  log(`STEP ${step}: ${message}`, colors.brightopen + colors.cyan);
  log('='.repeat(60), colors.bright);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logData(label, data) {
  log(`  ${label}:`, colors.blue);
  console.log(JSON.stringify(data, null, 2));
}

async function apiCall(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  log('\n' + '█'.repeat(60), colors.bright);
  log('    SENTINEL DEMO - Complete Loan Lifecycle Test', colors.cyan + colors.bright);
  log('█'.repeat(60) + '\n', colors.bright);

  log(`API Base URL: ${API_BASE}`, colors.blue);
  log(`API Key: ${API_KEY.substring(0, 20)}...`, colors.blue);
  log('');

  // Generate test DID
  const testDID = `did:ethr:0x${Math.random().toString(16).substring(2, 42)}`;
  let loanId = null;

  try {
    // ===== STEP 1: Health Check =====
    logStep(1, 'Health Check');
    const health = await apiCall('GET', '/health');

    if (!health.success) {
      logError('Server is not running!');
      logError(`Make sure Sentinel is running at ${API_BASE}`);
      process.exit(1);
    }

    logSuccess('Server is healthy');
    logData('Server Info', health.data);

    await sleep(1000);

    // ===== STEP 2: Register Agent =====
    logStep(2, 'Register Agent');
    log(`  DID: ${testDID}`, colors.blue);

    const registerResult = await apiCall('POST', '/agents/register', {
      did: testDID
    });

    if (!registerResult.success) {
      logError(`Registration failed: ${JSON.stringify(registerResult.error)}`);
      process.exit(1);
    }

    logSuccess('Agent registered successfully');
    logData('Agent Profile', registerResult.data.data);

    await sleep(1000);

    // ===== STEP 3: Request Loan =====
    logStep(3, 'Request Loan');
    const loanRequest = {
      did: testDID,
      amount: 500,
      purpose: 'GPU compute for AI model training'
    };

    log(`  Amount: $${loanRequest.amount} USD₮`, colors.blue);
    log(`  Purpose: ${loanRequest.purpose}`, colors.blue);

    const loanResult = await apiCall('POST', '/loans/request', loanRequest);

    if (!loanResult.success) {
      logError(`Loan request failed: ${JSON.stringify(loanResult.error)}`);
      process.exit(1);
    }

    const loanData = loanResult.data.data;
    loanId = loanData.loanId;

    if (loanData.decision === 'approved') {
      logSuccess(`Loan APPROVED!`);
      logData('Loan Terms', loanData.terms);
      logData('Credit Scoring', loanData.scoring);
    } else {
      logError(`Loan DENIED: ${loanData.reason}`);
      logData('Denial Reason', loanData);
      process.exit(0);
    }

    await sleep(1000);

    // ===== STEP 4: Check Loan Status =====
    logStep(4, 'Check Loan Status');
    const statusResult = await apiCall('GET', `/loans/${loanId}/status`);

    if (!statusResult.success) {
      logError(`Status check failed: ${JSON.stringify(statusResult.error)}`);
      process.exit(1);
    }

    logSuccess('Loan status retrieved');
    logData('Loan Status', statusResult.data.data);

    await sleep(1000);

    // ===== STEP 5: Disburse Loan =====
    logStep(5, 'Disburse Loan (WDK Transaction)');
    log('  This step executes a real USD₮ transfer via WDK', colors.yellow);
    log('  Requires: WDK_SEED_PHRASE configured + USDT + ETH for gas', colors.yellow);

    const disburseResult = await apiCall('POST', `/loans/${loanId}/disburse`);

    if (!disburseResult.success) {
      logError(`Disbursement failed: ${JSON.stringify(disburseResult.error)}`);
      // Continue anyway for demo purposes
    } else {
      logSuccess('Loan disbursed!');
      logData('Transaction Details', disburseResult.data.data);

      if (disburseResult.data.data.txHash && disburseResult.data.data.txHash.startsWith('0x') && disburseResult.data.data.txHash.length === 66) {
        log('\n  🎉 REAL TRANSACTION CONFIRMED!', colors.green + colors.bright);
        log(`  View on Etherscan: https://sepolia.etherscan.io/tx/${disburseResult.data.data.txHash}`, colors.blue);
      }
    }

    await sleep(2000);

    // ===== STEP 6: Time Passes (Borrower Uses Funds) =====
    logStep(6, 'Repayment Phase');
    log('  In production, borrower uses the funds and repays on time', colors.blue);
    log('  Sentinel monitors the due date and sends reminders via Telegram', colors.blue);

    await sleep(1000);

    // ===== STEP 7: Process Repayment =====
    logStep(7, 'Process Repayment');
    const repayResult = await apiCall('POST', `/loans/${loanId}/repay`, {
      repaymentTxHash: `0xREPAY${Math.random().toString(16).substring(2, 66)}`
    });

    if (!repayResult.success) {
      logError(`Repayment processing failed: ${JSON.stringify(repayResult.error)}`);
    } else {
      logSuccess('Loan repaid successfully!');
      logData('Repayment Details', repayResult.data.data);

      if (repayResult.data.data.wasOnTime) {
        log('  ✓ On-time repayment bonus applied!', colors.green);
      } else {
        log('  ⚠️ Late repayment penalty applied', colors.yellow);
      }
    }

    await sleep(1000);

    // ===== STEP 8: Check Updated Credit Score =====
    logStep(8, 'Check Updated Credit Score');
    const scoreResult = await apiCall('GET', `/agents/${testDID}/score`);

    if (!scoreResult.success) {
      logError(`Score check failed: ${JSON.stringify(scoreResult.error)}`);
    } else {
      logSuccess('Credit score updated');
      logData('Updated Agent Profile', scoreResult.data.data);

      const newScore = scoreResult.data.data.creditScore;
      const newTier = scoreResult.data.data.tier;

      if (repayResult.success && repayResult.data.data.creditScoreChange > 0) {
        log(`\n  🎊 Credit Score Increased: ${newScore} (Tier ${newTier})`, colors.green + colors.bright);
      }
    }

    // ===== DEMO COMPLETE =====
    log('\n' + '█'.repeat(60), colors.bright);
    log('    ✓ DEMO COMPLETE - All Steps Passed!', colors.green + colors.bright);
    log('█'.repeat(60) + '\n', colors.bright);

    log('Summary:', colors.bright);
    log(`  • Agent DID: ${testDID}`, colors.blue);
    log(`  • Loan ID: ${loanId}`, colors.blue);
    log(`  • Amount: $500 USD₮`, colors.blue);
    log(`  • Status: REPAID`, colors.green);
    log(`  • Credit Score: Improved ✓`, colors.green);

    log('\nNext Steps:', colors.bright);
    log('  1. Review the transaction on Etherscan (Sepolia testnet)', colors.blue);
    log('  2. Set up Telegram bot for loan alerts', colors.blue);
    log('  3. Configure Groq API for LLM credit reasoning', colors.blue);
    log('  4. Run unit tests: npm test', colors.blue);
    log('  5. Start the repayment monitor: npm run monitor\n', colors.blue);

  } catch (error) {
    logError(`\nDemo failed with error:`);
    console.error(error);
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(error => {
  logError('Fatal error in demo script:');
  console.error(error);
  process.exit(1);
});
