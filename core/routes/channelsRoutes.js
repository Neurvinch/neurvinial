// ============================================
// SENTINEL — OpenClaw-Integrated Channels Router
// ============================================
// Routes for Telegram and WhatsApp channels using OpenClaw plugin SDK.
// Channels handle user interactions and invoke OpenClaw skills.

const express = require('express');
const logger = require('../config/logger');
const { invokeSkill, listSkills } = require('../agent/openclawIntegration');
const telegramChannel = require('./telegramChannel');
const whatsappChannel = require('./whatsappChannel');

const router = express.Router();

// ============================================
// Channels Status Endpoint
// ============================================

/**
 * GET /channels/status
 * Returns status of all channels
 */
router.get('/status', (req, res) => {
  const status = {
    telegram: {
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      status: process.env.TELEGRAM_BOT_TOKEN ? 'active' : 'disabled'
    },
    whatsapp: {
      enabled: !!process.env.TWILIO_ACCOUNT_SID,
      status: process.env.TWILIO_ACCOUNT_SID ? 'active' : 'disabled'
    },
    skills: listSkills()
  };

  res.json({ success: true, data: status });
});

// ============================================
// Telegram Channel Routes
// ============================================

/**
 * POST /channels/telegram/webhook
 * Receives webhook from Telegram Bot API
 */
router.post('/telegram/webhook', async (req, res) => {
  try {
    await telegramChannel.handleTelegramWebhook(req.body);
    res.json({ ok: true });
  } catch (error) {
    logger.error('Telegram webhook error', { error: error.message });
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ============================================
// WhatsApp Channel Routes
// ============================================

/**
 * POST /channels/whatsapp/webhook
 * Receives webhook from Twilio WhatsApp
 */
router.post('/whatsapp/webhook', async (req, res) => {
  try {
    await whatsappChannel.handleWhatsAppWebhook(req, res);
  } catch (error) {
    logger.error('WhatsApp webhook error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /channels/whatsapp/webhook
 * Twilio webhook verification
 */
router.get('/whatsapp/webhook', (req, res) => {
  // Twilio challenge verification
  const challenge = req.query['hub.challenge'];
  if (challenge) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// ============================================
// Direct Skill Invocation via Channels
// ============================================

/**
 * POST /channels/invoke/:skillName
 * Direct invocation of a skill with channel context
 */
router.post('/invoke/:skillName', async (req, res) => {
  try {
    const { skillName } = req.params;
    const { context = {}, channel = 'api' } = req.body;

    logger.info('Skill invoked via channel', {
      skillName,
      channel,
      contextKeys: Object.keys(context)
    });

    const result = await invokeSkill(skillName, {
      ...context,
      channel,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Skill invocation failed', { error: error.message });
    res.status(400).json({ error: { message: error.message, code: 'SKILL_ERROR' } });
  }
});

// ============================================
// Test Endpoints
// ============================================

/**
 * POST /channels/test/telegram
 * Send a test Telegram message to a chat
 */
router.post('/test/telegram', async (req, res) => {
  try {
    const { chatId, message } = req.body;

    if (!telegramChannel.bot) {
      return res.status(400).json({ error: 'Telegram bot not configured' });
    }

    await telegramChannel.bot.sendMessage(chatId, message);
    res.json({ success: true, message: 'Test message sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /channels/test/whatsapp
 * Send a test WhatsApp message
 */
router.post('/test/whatsapp', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    const success = await whatsappChannel.sendWhatsAppMessage(phoneNumber, message);

    if (success) {
      res.json({ success: true, message: 'Test message sent' });
    } else {
      res.status(500).json({ error: 'Failed to send message' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
