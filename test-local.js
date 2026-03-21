#!/usr/bin/env node

// ============================================
// SENTINEL — Local System Test Suite
// ============================================
// Comprehensive test of all Sentinel systems.
// Checks configuration, dependencies, and functionality.
//
// Usage:
//   node test-local.js
//
// This script verifies:
//   1. Environment configuration
//   2. MongoDB connection
//   3. WDK integration
//   4. Credit scoring systems
//   5. API authentication
//   6. Telegram bot (if configured)

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./core/config');
const logger = require('./core/config/logger');

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(name) {
  process.stdout.write(`  Testing ${name}... `);
}

function logPass() {
  log('PASS', colors.green);
}

function logFail(reason = '') {
  log(`FAIL ${reason}`, colors.red);
}

function logWarn(reason = '') {
  log(`WARN ${reason}`, colors.yellow);
}

// Test results collector
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function recordTest(name, status, details = null) {
  results.tests.push({ name, status, details });

  if (status === 'pass') results.passed++;
  else if (status === 'fail') results.failed++;
  else if (status === 'warn') results.warnings++;
}

async function runTests() {
  log('\n' + '='.repeat(60), colors.bright);
  log('  SENTINEL — Local System Test Suite', colors.cyan + colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  // ===== ENV CONFIGURATION =====
  log('1. Environment Configuration', colors.bright);

  logTest('PORT configuration');
  if (config.server.port) {
    logPass();
    recordTest('PORT', 'pass', config.server.port);
  } else {
    logFail('(using default 3000)');
    recordTest('PORT', 'warn', 'using default');
  }

  logTest('MONGODB_URI');
  if (config.db.uri && config.db.uri.includes('mongodb')) {
    logPass();
    recordTest('MONGODB_URI', 'pass');
  } else {
    logFail('(not configured)');
    recordTest('MONGODB_URI', 'fail', 'required for database operations');
  }

  logTest('WDK_SEED_PHRASE');
  if (config.wdk.seedPhrase && config.wdk.seedPhrase.split(' ').length >= 12) {
    logPass();
    recordTest('WDK_SEED_PHRASE', 'pass');
  } else {
    logFail('(not configured - REQUIRED for on-chain transactions)');
    recordTest('WDK_SEED_PHRASE', 'fail', 'WDK requires a valid 12-word seed phrase');
  }

  logTest('TELEGRAM_BOT_TOKEN');
  if (config.telegram.botToken) {
    logPass();
    recordTest('TELEGRAM_BOT_TOKEN', 'pass');
  } else {
    logWarn('(not configured - alerts will log only)');
    recordTest('TELEGRAM_BOT_TOKEN', 'warn', 'telegram alerts disabled');
  }

  logTest('GROQ_API_KEY');
  if (config.groq.apiKey) {
    logPass();
    recordTest('GROQ_API_KEY', 'pass');
  } else {
    logWarn('(not configured - will use rule-based fallback)');
    recordTest('GROQ_API_KEY', 'warn', 'LLM scoring will use fallback');
  }

  logTest('API_KEYS');
  const apiKeys = process.env.API_KEYS;
  if (apiKeys && apiKeys.length > 0) {
    logPass();
    recordTest('API_KEYS', 'pass', `${apiKeys.split(',').length} key(s) configured`);
  } else {
    logWarn('(using default demo key)');
    recordTest('API_KEYS', 'warn', 'using default key only');
  }

  // ===== MONGODB CONNECTION =====
  log('\n2. MongoDB Connection', colors.bright);

  logTest('MongoDB connection');
  try {
    await mongoose.connect(config.db.uri, {
      serverSelectionTimeoutMS: 5000
    });
    logPass();
    recordTest('MongoDB Connection', 'pass', 'connected successfully');
  } catch (error) {
    logFail(`(${error.message})`);
    recordTest('MongoDB Connection', 'fail', error.message);
  }

  if (mongoose.connection.readyState === 1) {
    logTest('Database name');
    const dbName = mongoose.connection.db.databaseName;
    log(`OK (${dbName})`, colors.green);
    recordTest('Database Name', 'pass', dbName);

    logTest('Collections access');
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      logPass();
      recordTest('Collections', 'pass', `${collections.length} collection(s) found`);
    } catch (error) {
      logFail(`(${error.message})`);
      recordTest('Collections', 'fail', error.message);
    }
  }

  // ===== WDK INTEGRATION =====
  log('\n3. WDK Integration', colors.bright);

  logTest('WDK module import');
  try {
    const walletManager = require('./core/wdk/walletManager');
    logPass();
    recordTest('WDK Import', 'pass');

    logTest('WDK initialization');
    try {
      await walletManager.initialize();
      logPass();
      recordTest('WDK Initialization', 'pass');

      logTest('Sentinel wallet address');
      const address = await walletManager.getSentinelAddress();
      if (address && address.startsWith('0x') && address.length === 42) {
        log(`OK (${address.substring(0, 10)}...)`, colors.green);
        recordTest('Sentinel Address', 'pass', address);
      } else {
        logFail('(invalid address format)');
        recordTest('Sentinel Address', 'fail', 'address format error');
      }
    } catch (error) {
      logFail(`(${error.message})`);
      recordTest('WDK Initialization', 'fail', error.message);
    }
  } catch (error) {
    logFail(`(${error.message})`);
    recordTest('WDK Import', 'fail', error.message);
  }

  // ===== CREDIT SCORING =====
  log('\n4. Credit Scoring Systems', colors.bright);

  logTest('ML model');
  try {
    const mlModel = require('./core/scoring/mlModel');
    const testScore = mlModel.score({
      totalLoans: 5,
      totalRepaid: 5,
      totalDefaulted: 0,
      onTimeRate: 1.0,
      registeredAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      recentTxCount: 20,
      collateralRatio: 0.5
    });

    if (testScore.mlScore >= 0 && testScore.mlScore <= 100) {
      logPass();
      recordTest('ML Model', 'pass', `score=${testScore.mlScore}`);
    } else {
      logFail('(invalid score range)');
      recordTest('ML Model', 'fail', 'score out of bounds');
    }
  } catch (error) {
    logFail(`(${error.message})`);
    recordTest('ML Model', 'fail', error.message);
  }

  logTest('Tier calculator');
  try {
    const { getTierFromScore } = require('./core/utils/tierCalculator');
    const tier = getTierFromScore(80);

    if (tier.tierLetter === 'A' && tier.apr === 0.04) {
      logPass();
      recordTest('Tier Calculator', 'pass');
    } else {
      logFail('(incorrect tier mapping)');
      recordTest('Tier Calculator', 'fail', 'tier logic error');
    }
  } catch (error) {
    logFail(`(${error.message})`);
    recordTest('Tier Calculator', 'fail', error.message);
  }

  logTest('LLM scorer');
  try {
    const llmScorer = require('./core/scoring/llmScorer');
    // Just check if it loads without error
    logPass();
    recordTest('LLM Scorer', 'pass');
  } catch (error) {
    logFail(`(${error.message})`);
    recordTest('LLM Scorer', 'fail', error.message);
  }

  // ===== API AUTHENTICATION =====
  log('\n5. API Authentication', colors.bright);

  logTest('API auth middleware');
  try {
    const { requireApiKey, generateApiKey } = require('./core/middleware/apiAuth');
    const newKey = generateApiKey();

    if (newKey && newKey.startsWith('sentinel_') && newKey.length > 20) {
      logPass();
      recordTest('API Auth', 'pass');
    } else {
      logFail('(invalid key format)');
      recordTest('API Auth', 'fail', 'key generation error');
    }
  } catch (error) {
    logFail(`(${error.message})`);
    recordTest('API Auth', 'fail', error.message);
  }

  // ===== VALIDATION SCHEMAS =====
  log('\n6. Validation Schemas', colors.bright);

  logTest('Joi schemas');
  try {
    const schemas = require('./core/middleware/schemas');
    const testValidation = schemas.loanRequestSchema.validate({
      did: 'did:ethr:0x1234',
      amount: 500,
      purpose: 'test'
    });

    if (!testValidation.error) {
      logPass();
      recordTest('Validation Schemas', 'pass');
    } else {
      logFail('(validation failed)');
      recordTest('Validation Schemas', 'fail', testValidation.error.message);
    }
  } catch (error) {
    logFail(`(${error.message})`);
    recordTest('Validation Schemas', 'fail', error.message);
  }

  // ===== TELEGRAM BOT =====
  if (config.telegram.botToken) {
    log('\n7. Telegram Bot', colors.bright);

    logTest('Telegram bot initialization');
    try {
      const bot = require('./telegram/bot');
      logPass();
      recordTest('Telegram Bot', 'pass');
    } catch (error) {
      logFail(`(${error.message})`);
      recordTest('Telegram Bot', 'fail', error.message);
    }
  }

  // ===== CLEANUP =====
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }

  // ===== RESULTS SUMMARY =====
  log('\n' + '='.repeat(60), colors.bright);
  log('  TEST RESULTS', colors.cyan + colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  log(`Total Tests: ${results.passed + results.failed + results.warnings}`, colors.bright);
  log(`Passed: ${results.passed}`, colors.green);
  log(`Failed: ${results.failed}`, results.failed > 0 ? colors.red : colors.green);
  log(`Warnings: ${results.warnings}`, results.warnings > 0 ? colors.yellow : colors.green);

  if (results.failed === 0 && results.warnings === 0) {
    log('\n✓ ALL SYSTEMS OPERATIONAL', colors.green + colors.bright);
    log('  Your Sentinel instance is fully configured and ready for production.\n', colors.green);
  } else if (results.failed === 0) {
    log('\n⚠ SYSTEM OPERATIONAL WITH WARNINGS', colors.yellow + colors.bright);
    log('  Some optional features are not configured.', colors.yellow);
    log('  The system will work with graceful degradation.\n', colors.yellow);
  } else {
    log('\n✗ SYSTEM HAS CRITICAL ERRORS', colors.red + colors.bright);
    log('  Please fix the failed tests before running Sentinel.\n', colors.red);
  }

  log('Recommendations:', colors.bright);
  if (!config.db.uri || !config.db.uri.includes('mongodb')) {
    log('  • Set MONGODB_URI in .env for database functionality', colors.yellow);
  }
  if (!config.wdk.seedPhrase || config.wdk.seedPhrase.split(' ').length < 12) {
    log('  • Set WDK_SEED_PHRASE for real on-chain transactions', colors.yellow);
  }
  if (!config.telegram.botToken) {
    log('  • Set TELEGRAM_BOT_TOKEN for loan alerts', colors.yellow);
  }
  if (!config.groq.apiKey) {
    log('  • Set GROQ_API_KEY for LLM credit reasoning', colors.yellow);
  }

  log('\nNext Steps:', colors.bright);
  log('  1. Run unit tests: npm test', colors.blue);
  log('  2. Start the server: npm start', colors.blue);
  log('  3. Run the demo: node demo-flow.js', colors.blue);
  log('  4. Check the README: cat README.md\n', colors.blue);

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log('\n✗ Fatal error in test suite:', colors.red);
  console.error(error);
  process.exit(1);
});
