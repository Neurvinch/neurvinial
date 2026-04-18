// ============================================
// Neurvinial — Channels Coordinator
// ============================================
// Manages communication channels for Sentinel AI Lending Agent.
//
// RECOMMENDED: Use OpenClaw Gateway for production deployments!
//   - OpenClaw handles 20+ channels (Telegram, WhatsApp, Slack, Discord, etc.)
//   - Just configure openclaw.json and run: openclaw gateway
//   - See OPENCLAW_GATEWAY_SETUP.md for details
//
// This module provides FALLBACK standalone implementations:
//   - Useful for development/testing without full OpenClaw Gateway
//   - REST API access remains available via channelsRoutes.js
//
// ============================================

const logger = require('../config/logger');
const telegramChannel = require('./telegramChannel');
const whatsappChannel = require('./whatsappChannel');

// Check for OpenClaw Gateway
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || null;

/**
 * Initialize all channels.
 * Prefers OpenClaw Gateway if available, falls back to standalone.
 */
const initializeAllChannels = async () => {
  const results = {
    telegram: false,
    whatsapp: false,
    gateway: false
  };

  // Check for OpenClaw Gateway first
  if (OPENCLAW_GATEWAY_URL) {
    logger.info('OpenClaw Gateway detected - channels managed by Gateway', {
      url: OPENCLAW_GATEWAY_URL
    });
    results.gateway = true;
    return results;
  }

  logger.info('No OpenClaw Gateway - using standalone channel implementations');
  logger.info('TIP: Use OpenClaw Gateway for production! See OPENCLAW_GATEWAY_SETUP.md');

  try {
    // Initialize Telegram (standalone fallback)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      results.telegram = telegramChannel.initializeTelegram();
      logger.info('Telegram channel enabled (standalone mode)');
    } else {
      logger.debug('Telegram not configured - set TELEGRAM_BOT_TOKEN to enable');
    }

    // Initialize WhatsApp (standalone fallback)
    if (process.env.TWILIO_ACCOUNT_SID) {
      results.whatsapp = whatsappChannel.initializeWhatsApp();
      logger.info('WhatsApp channel enabled (standalone mode)');
    } else {
      logger.debug('WhatsApp not configured - set TWILIO_ACCOUNT_SID to enable');
    }

    const enabled = Object.entries(results)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel);

    logger.info('Channels initialized', { enabled: enabled.length > 0 ? enabled : 'none' });
    return results;
  } catch (error) {
    logger.error('Failed to initialize channels', { error: error.message });
    return results;
  }
};

/**
 * Stop all channels.
 */
const stopAllChannels = () => {
  try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      telegramChannel.stopTelegram();
    }
    logger.info('All channels stopped');
  } catch (error) {
    logger.error('Error stopping channels', { error: error.message });
  }
};

/**
 * Get channel statistics.
 */
const getChannelStats = () => ({
  mode: OPENCLAW_GATEWAY_URL ? 'gateway' : 'standalone',
  gateway: OPENCLAW_GATEWAY_URL || null,
  telegram: {
    enabled: !!process.env.TELEGRAM_BOT_TOKEN,
    mode: OPENCLAW_GATEWAY_URL ? 'gateway-managed' : 'standalone',
    status: telegramChannel.bot ? 'polling' : 'disabled'
  },
  whatsapp: {
    enabled: !!process.env.TWILIO_ACCOUNT_SID,
    mode: OPENCLAW_GATEWAY_URL ? 'gateway-managed' : 'standalone',
    webhook: '/api/channels/whatsapp/webhook'
  },
  recommendation: OPENCLAW_GATEWAY_URL
    ? 'Using OpenClaw Gateway (recommended)'
    : 'Consider using OpenClaw Gateway for 20+ channels. See OPENCLAW_GATEWAY_SETUP.md'
});

// Exports
module.exports = {
  initializeAllChannels,
  stopAllChannels,
  getChannelStats,
  telegramChannel,
  whatsappChannel
};
