// ============================================
// SENTINEL — Main Express Server Entry Point
// ============================================
// This is the orchestration hub. Responsibilities in exact order:
// 1. Load environment variables
// 2. Validate config (exits on missing required vars)
// 3. Connect to MongoDB Atlas
// 4. Initialize Express with security middleware
// 5. Mount API routes
// 6. Start listening

require('dotenv').config();

const config = require('./config');
const logger = require('./config/logger');
const mongoose = require('mongoose');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const agentRoutes = require('./routes/agentRoutes');
const loanRoutes = require('./routes/loanRoutes');
const capitalRoutes = require('./routes/capitalRoutes');
const walletManager = require('./wdk/walletManager');
const repaymentMonitor = require('./monitor/daemon');
const telegramBot = require('../telegram/bot');

const app = express();

// ---- Security Middleware ----
app.use(helmet());                          // Sets secure HTTP headers
app.use(cors());                            // Enable CORS for all origins (dev)
app.use(express.json({ limit: '1mb' }));    // Parse JSON bodies, limit size

// Rate limiter: 100 requests per 15 minutes per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests', code: 'RATE_LIMITED' } }
}));

// ---- Health Check ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sentinel',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ---- API Routes ----
app.use('/agents', agentRoutes);
app.use('/loans', loanRoutes);
app.use('/capital', capitalRoutes);

// ---- Error Handler (must be last) ----
app.use(errorHandler);

// ---- Startup Function ----
async function start() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect(config.db.uri);
    logger.info('Connected to MongoDB Atlas');

    // Initialize WDK wallet
    await walletManager.initialize();

    // Initialize Telegram bot
    telegramBot.initialize();

    // Start repayment monitor (checks every minute)
    repaymentMonitor.start('* * * * *');

    // Start Express server
    app.listen(config.server.port, () => {
      logger.info(`Sentinel listening on port ${config.server.port}`, {
        env: config.server.env,
        blockchain: config.wdk.blockchain,
        network: config.wdk.network
      });
    });
  } catch (err) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

// Export app for testing with supertest
module.exports = app;
