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

// Disable Mongoose buffering globally — queries fail immediately instead of
// hanging for 10 seconds when MongoDB is unavailable.
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false);

const config = require('./config');
const logger = require('./config/logger');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const agentRoutes = require('./routes/agentRoutes');
const loanRoutes = require('./routes/loanRoutes');
const capitalRoutes = require('./routes/capitalRoutes');
const openclawRoutes = require('./agent/agentRoutes');
const channelsRoutes = require('./routes/channelsRoutes');
const walletManager = require('./wdk/walletManager');
const repaymentMonitor = require('./monitor/daemon');
const telegramChannel = require('./channels/telegramChannel');
const whatsappChannel = require('./channels/whatsappChannel');
const { initialize: initializeOpenClaw } = require('./agent/openclawIntegration');

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
app.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    service: 'sentinel',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    components: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      openclaw: 'initialized',
      telegram: !!process.env.TELEGRAM_BOT_TOKEN ? 'active' : 'disabled',
      whatsapp: !!process.env.TWILIO_ACCOUNT_SID ? 'active' : 'disabled'
    }
  });
});

// ---- API Routes ----
app.use('/agents', agentRoutes);
app.use('/loans', loanRoutes);
app.use('/capital', capitalRoutes);
app.use('/agent', openclawRoutes);              // OpenClaw skills API
app.use('/channels', channelsRoutes);           // Telegram & WhatsApp channels

// ---- Error Handler (must be last) ----
app.use(errorHandler);

// ---- Port finder — tries preferred port, increments if busy ----
function listenOnAvailablePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = app.listen(preferredPort);

    server.on('listening', () => {
      const { port } = server.address();
      resolve(port);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${preferredPort} in use, trying ${preferredPort + 1}...`);
        server.close();
        // Recurse to the next port
        listenOnAvailablePort(preferredPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// ---- Startup Function ----
async function start() {
  try {
    // Connect to MongoDB Atlas
    try {
      await mongoose.connect(config.db.uri);
      logger.info('Connected to MongoDB Atlas');
      module.exports.isDbConnected = true;
    } catch (dbErr) {
      if (config.server.env === 'development') {
        logger.warn('MongoDB connection failed, running in demo mode', { error: dbErr.message });
        module.exports.isDbConnected = false;
      } else {
        throw dbErr;
      }
    }

    // Initialize WDK wallet
    await walletManager.initialize();

    // Initialize OpenClaw agent runtime
    await initializeOpenClaw();

    // Initialize communication channels (Telegram, WhatsApp)
    telegramChannel.initializeTelegram();
    whatsappChannel.initializeWhatsApp();

    // Start repayment monitor (checks every minute)
    repaymentMonitor.start('* * * * *');

    // Start Express server — auto-finds a free port if preferred is busy
    const port = await listenOnAvailablePort(config.server.port);
    logger.info(`Sentinel listening on port ${port}`, {
      env: config.server.env,
      blockchain: config.wdk.blockchain,
      network: config.wdk.network
    });

    if (port !== config.server.port) {
      logger.warn(`Note: Started on port ${port} (port ${config.server.port} was busy). Update your frontend API base URL if needed.`);
    }
  } catch (err) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});

// Handle uncaught exceptions — only fatal for non-port errors
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Already handled inside listenOnAvailablePort — ignore here
    return;
  }
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

// Export app for testing with supertest
module.exports = app;
