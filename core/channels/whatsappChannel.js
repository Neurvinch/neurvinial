// ============================================
// SENTINEL — WhatsApp Channel Integration
// ============================================
// Integrates WhatsApp for lending agent interaction using Twilio API.
// Users can request loans, check status, and get updates via WhatsApp.

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');
const { invokeSkill } = require('../agent/openclawIntegration');
const { Agent, Loan } = require('../models');
const mongoose = require('mongoose');

// WhatsApp user context tracking
const whatsappContexts = new Map();

/**
 * Get or create WhatsApp user context.
 */
const getOrCreateWhatsAppContext = async (phoneNumber) => {
  if (!whatsappContexts.has(phoneNumber)) {
    whatsappContexts.set(phoneNumber, {
      phoneNumber,
      did: null,
      creditScore: null,
      registeredAt: Date.now()
    });
  }
  return whatsappContexts.get(phoneNumber);
};

/**
 * Send WhatsApp message via Twilio API.
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 */
const sendWhatsAppMessage = async (toPhoneNumber, message) => {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_PHONE_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppFrom) {
    logger.warn('WhatsApp not configured - missing Twilio credentials');
    return false;
  }

  try {
    const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');

    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      new URLSearchParams({
        From: `whatsapp:${twilioWhatsAppFrom}`,
        To: `whatsapp:${toPhoneNumber}`,
        Body: message
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    logger.debug('WhatsApp message sent', { to: toPhoneNumber });
    return true;
  } catch (error) {
    logger.error('Failed to send WhatsApp message', { error: error.message });
    return false;
  }
};

/**
 * Parse WhatsApp webhook body.
 */
const parseWhatsAppWebhook = (body) => {
  const { From, Body } = body;

  if (!From || !Body) {
    return null;
  }

  const phoneNumber = From.replace('whatsapp:', '');
  const message = Body.trim();

  return { phoneNumber, message };
};

/**
 * Handle WhatsApp /register command.
 */
const handleWhatsAppRegister = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  try {
    const did = `did:whatsapp:${phoneNumber}`;
    context.did = did;

    if (mongoose.connection.readyState === 1) {
      const agent = new Agent({
        did,
        walletAddress: `0x${phoneNumber.replace(/\D/g, '').padStart(40, '0')}`,
        creditScore: 50,
        tier: 'C'
      });
      await agent.save();
    }

    const message = `✅ *Registration Successful*

Your DID: ${did}
Credit Score: 50 (Tier C)

Send "status" to check score or "request 500" to apply for a loan.`;

    await sendWhatsAppMessage(phoneNumber, message);
    logger.info('WhatsApp user registered', { did, phoneNumber });
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Registration failed: ${error.message}`);
    logger.error('WhatsApp registration failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp status check.
 */
const handleWhatsAppStatus = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please send "register" first to create an account.');
    return;
  }

  try {
    const result = await invokeSkill('sentinel_credit', {
      did: context.did,
      action: 'assess_creditworthiness'
    });

    const data = result.result.data || {};
    const message = `📊 *Your Credit Profile*

Score: ${data.creditScore || 50}
Tier: ${data.tier || 'C'}
Max Loan: $${data.maxLoanAmount || 500}
Rate: ${data.interestRate ? (data.interestRate * 100).toFixed(1) : 8}%

Reason: ${result.result.reasoning}`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Status check failed: ${error.message}`);
    logger.error('WhatsApp status check failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp loan request.
 */
const handleWhatsAppRequest = async (phoneNumber, amount) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first.');
    return;
  }

  const parsedAmount = parseInt(amount);
  if (!parsedAmount || parsedAmount < 100) {
    await sendWhatsAppMessage(phoneNumber, '📝 Please specify a valid amount. Example: "request 500"');
    return;
  }

  try {
    const result = await invokeSkill('sentinel_lending', {
      did: context.did,
      amount: parsedAmount,
      action: 'evaluate_loan_request'
    });

    const approved = result.result.action === 'approve_loan';
    const message = approved
      ? `✅ *Loan Approved!*\n\nAmount: $${parsedAmount} USDT\nConfidence: ${result.result.confidence}%\n\nReason: ${result.result.reasoning}`
      : `❌ *Loan Denied*\n\nReason: ${result.result.reasoning}`;

    await sendWhatsAppMessage(phoneNumber, message);
    logger.info('WhatsApp loan request processed', { phoneNumber, amount: parsedAmount, approved });
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Request failed: ${error.message}`);
    logger.error('WhatsApp request failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp help command.
 */
const handleWhatsAppHelp = async (phoneNumber) => {
  const helpMessage = `ℹ️ *SENTINEL WhatsApp Bot*

Available Commands:
• register - Create an account
• status - Check your credit score
• request 500 - Request a loan (change amount)
• balance - Check treasury balance
• help - Show this message

Example:
request 500

Network: Ethereum Sepolia
Token: USDT`;

  await sendWhatsAppMessage(phoneNumber, helpMessage);
};

/**
 * Handle WhatsApp message.
 */
const handleWhatsAppMessage = async (phoneNumber, messageText) => {
  const command = messageText.toLowerCase().trim();

  if (command === 'register') {
    await handleWhatsAppRegister(phoneNumber);
  } else if (command === 'status') {
    await handleWhatsAppStatus(phoneNumber);
  } else if (command.startsWith('request')) {
    const amount = command.split(' ')[1];
    await handleWhatsAppRequest(phoneNumber, amount);
  } else if (command === 'balance') {
    try {
      const walletManager = require('../wdk/walletManager');
      const ethBal = await walletManager.getSentinelETHBalance();
      const usdtBal = await walletManager.getSentinelUSDTBalance();

      const message = `💰 *Sentinel Treasury*\n\nETH: ${ethBal.balance}\nUSDT: ${usdtBal.balance}`;
      await sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      await sendWhatsAppMessage(phoneNumber, `❌ Balance check failed: ${error.message}`);
    }
  } else if (command === 'help') {
    await handleWhatsAppHelp(phoneNumber);
  } else {
    // Auto-help for unknown commands
    const greeting = `👋 Welcome to SENTINEL!\n\nType "help" to see available commands or "register" to get started.`;
    await sendWhatsAppMessage(phoneNumber, greeting);
  }
};

/**
 * Handle WhatsApp webhook (for Express route).
 */
const handleWhatsAppWebhook = async (req, res) => {
  try {
    const parsed = parseWhatsAppWebhook(req.body);

    if (!parsed) {
      return res.status(400).json({ error: 'Invalid webhook body' });
    }

    const { phoneNumber, message } = parsed;

    logger.debug('WhatsApp message received', { phoneNumber, message });

    // Process message asynchronously
    setImmediate(() => {
      handleWhatsAppMessage(phoneNumber, message).catch((error) => {
        logger.error('Error handling WhatsApp message', { error: error.message });
      });
    });

    // Return 200 OK immediately
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('WhatsApp webhook error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
};

/**
 * Initialize WhatsApp channel.
 */
const initializeWhatsApp = () => {
  logger.info('WhatsApp channel initialized', {
    configured: !!process.env.TWILIO_ACCOUNT_SID
  });
  return true;
};

// Exports
module.exports = {
  initializeWhatsApp,
  handleWhatsAppMessage,
  handleWhatsAppWebhook,
  handleWhatsAppRegister,
  handleWhatsAppStatus,
  handleWhatsAppRequest,
  handleWhatsAppHelp,
  sendWhatsAppMessage,
  parseWhatsAppWebhook,
  getOrCreateWhatsAppContext
};
