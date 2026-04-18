#!/usr/bin/env node
// ============================================
// Neurvinial — Telegram Webhook Setup
// ============================================
// Run this script to configure Telegram webhook for production

const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = process.env.BASE_URL || 'https://neurvinial.onrender.com';

async function setupTelegramWebhook() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  const webhookUrl = `${BASE_URL}/channels/telegram/webhook`;
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

  console.log('🔧 Setting up Telegram webhook...');
  console.log(`📍 Webhook URL: ${webhookUrl}`);

  try {
    const response = await axios.post(telegramApiUrl, {
      url: webhookUrl,
      allowed_updates: ['message']
    });

    if (response.data.ok) {
      console.log('✅ Telegram webhook set successfully!');
      console.log('📊 Response:', response.data);

      // Get webhook info to verify
      const infoResponse = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
      );
      console.log('📝 Webhook Info:', infoResponse.data.result);
    } else {
      console.error('❌ Failed to set webhook:', response.data);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupTelegramWebhook();
}

module.exports = { setupTelegramWebhook };
