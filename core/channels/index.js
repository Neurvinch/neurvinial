// ============================================
// SENTINEL — Channels Coordinator
// ============================================
// Manages all communication channels (Telegram, WhatsApp, etc.)

const logger = require('../config/logger');
const telegramChannel = require('./telegramChannel');
const whatsappChannel = require('./whatsappChannel');

/**
 * Initialize all channels.
 */
const initializeAllChannels = async () => {
  const results = {
    telegram: false,
    whatsapp: false
  };

  try {
    // Initialize Telegram
    if (process.env.TELEGRAM_BOT_TOKEN) {
      results.telegram = telegramChannel.initializeTelegram();
      logger.info('Telegram channel enabled');
    } else {
      logger.warn('Telegram bot not configured - set TELEGRAM_BOT_TOKEN to enable');
    }

    // Initialize WhatsApp
    if (process.env.TWILIO_ACCOUNT_SID) {
      results.whatsapp = whatsappChannel.initializeWhatsApp();
      logger.info('WhatsApp channel enabled');
    } else {
      logger.warn('WhatsApp not configured - set TWILIO_ACCOUNT_SID to enable');
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
  telegram: {
    enabled: !!process.env.TELEGRAM_BOT_TOKEN,
    contexts: telegramChannel.bot ? 'polling' : null
  },
  whatsapp: {
    enabled: !!process.env.TWILIO_ACCOUNT_SID,
    webhook: '/api/channels/whatsapp/webhook'
  }
});

// Exports
module.exports = {
  initializeAllChannels,
  stopAllChannels,
  getChannelStats,
  telegramChannel,
  whatsappChannel
};
