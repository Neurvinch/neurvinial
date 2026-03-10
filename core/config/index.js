// ============================================
// SENTINEL — Centralized Configuration
// ============================================
// Every module imports config from HERE — never reads process.env directly.
// This guarantees: (1) all env vars validated at startup, (2) single source of truth.

require('dotenv').config();

// --- Required environment variable validation ---
// In test environment, skip validation to allow unit tests to run
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;

if (!isTest) {
  const required = [
    'MONGODB_URI',
    'PORT'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`FATAL: Missing required environment variable: ${key}`);
      console.error('Copy .env.example to .env and fill in your values.');
      process.exit(1);
    }
  }
}

// --- Export frozen config object ---
const config = {
  db: {
    uri: process.env.MONGODB_URI
  },
  wdk: {
    seedPhrase: process.env.WDK_SEED_PHRASE || '',
    blockchain: process.env.WDK_BLOCKCHAIN || 'ethereum',
    network: process.env.WDK_NETWORK || 'sepolia',
    rpcUrl: process.env.WDK_RPC_URL || ''
  },
  ml: {
    defaultThreshold: parseFloat(process.env.ML_DEFAULT_THRESHOLD || '0.35')
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || ''
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || ''
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'debug'
  },
  loan: {
    defaultDurationDays: parseInt(process.env.DEFAULT_LOAN_DURATION_DAYS, 10) || 30,
    monitorPollMs: parseInt(process.env.MONITOR_POLL_INTERVAL_MS, 10) || 60000,
    idleThreshold: parseFloat(process.env.IDLE_CAPITAL_THRESHOLD_USDT || '1000')
  }
};

// Freeze to prevent accidental mutation anywhere in the codebase
Object.freeze(config);
Object.freeze(config.db);
Object.freeze(config.wdk);
Object.freeze(config.ml);
Object.freeze(config.telegram);
Object.freeze(config.groq);
Object.freeze(config.server);
Object.freeze(config.loan);

module.exports = config;
