// ============================================
// SENTINEL — Telegram Channel Integration
// ============================================
// Integrates Telegram Bot API for real-time lending agent interaction.
// Uses OpenClaw skills for intelligent responses.

const TelegramBot = require('node-telegram-bot-api');
const logger = require('../config/logger');
const config = require('../config');
const { invokeSkill } = require('../agent/openclawIntegration');
const { Agent } = require('../models');
const mongoose = require('mongoose');

// Initialize Telegram Bot
const telegramBotToken = config.telegram?.botToken;
const bot = telegramBotToken ? new TelegramBot(telegramBotToken, { polling: true }) : null;

// User context tracking
const userContexts = new Map();

/**
 * Parse command from message.
 */
const parseCommand = (text) => {
  const match = text.match(/^\/(\w+)\s*(.*)/);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2] };
};

/**
 * Get or create user context.
 */
const getOrCreateContext = async (chatId, userId) => {
  const key = `tg_${chatId}`;
  if (!userContexts.has(key)) {
    userContexts.set(key, {
      chatId,
      userId,
      did: null,
      creditScore: null,
      registeredAt: Date.now()
    });
  }
  return userContexts.get(key);
};

/**
 * Handle /start command.
 */
const handleStart = async (msg) => {
  const chatId = msg.chat.id;
  const text = `🤖 *Welcome to SENTINEL*

I'm your autonomous lending agent powered by WDK and on-chain credit scoring.

*Available Commands:*
/register - Register as a borrower
/status - Check your credit score
/request <amount> - Request a loan (in USDT)
/balance - Check Sentinel's balance
/help - Show this menu

💡 *How it works:*
1️⃣ Register your blockchain wallet
2️⃣ Request a loan in USDT
3️⃣ Get instant approval via ML + LLM
4️⃣ Receive funds on-chain
5️⃣ Repay on time for better credit

*Network:* Ethereum Sepolia
*Token:* USDT (ERC-20)`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
};

/**
 * Handle /register command.
 */
const handleRegister = async (msg) => {
  const chatId = msg.chat.id;
  const context = await getOrCreateContext(chatId, msg.from.id);

  try {
    const did = `did:telegram:${msg.from.id}`;
    context.did = did;

    if (mongoose.connection.readyState === 1) {
      const agent = new Agent({
        did,
        walletAddress: `0x${msg.from.id.toString(16).padStart(40, '0')}`,
        creditScore: 50,
        tier: 'C'
      });
      await agent.save();
    }

    const responseText = `✅ *Registration Successful*

DID: \`${did}\`
Credit Score: 50 (Tier C)

Use /status to check details or /request 500 to apply for a loan.`;

    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
    logger.info('User registered via Telegram', { did, chatId });
  } catch (error) {
    bot.sendMessage(chatId, `❌ Registration failed: ${error.message}`, { parse_mode: 'Markdown' });
    logger.error('Telegram registration failed', { error: error.message });
  }
};

/**
 * Handle /status command.
 */
const handleStatus = async (msg) => {
  const chatId = msg.chat.id;
  const context = await getOrCreateContext(chatId, msg.from.id);

  if (!context.did) {
    bot.sendMessage(chatId, '❌ Please /register first', { parse_mode: 'Markdown' });
    return;
  }

  try {
    const result = await invokeSkill('sentinel_credit', {
      did: context.did,
      action: 'assess_creditworthiness'
    });

    const data = result.result.data || {};
    const responseText = `📊 *Your Credit Profile*

Score: ${data.creditScore || 50}
Tier: ${data.tier || 'C'}
Max Loan: $${data.maxLoanAmount || 500}
Rate: ${data.interestRate ? (data.interestRate * 100).toFixed(1) : 8}%

*Analysis:*
${result.result.reasoning}`;

    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, `❌ Status check failed: ${error.message}`);
    logger.error('Telegram status check failed', { error: error.message });
  }
};

/**
 * Handle /request command.
 */
const handleRequest = async (msg, args) => {
  const chatId = msg.chat.id;
  const context = await getOrCreateContext(chatId, msg.from.id);

  if (!context.did) {
    bot.sendMessage(chatId, '❌ Please /register first');
    return;
  }

  if (!args || !args.match(/\d+/)) {
    bot.sendMessage(chatId, '📝 Usage: /request 500\n\n💡 Example: /request 500 (request 500 USDT)');
    return;
  }

  const amount = parseInt(args.match(/\d+/)[0]);

  try {
    const result = await invokeSkill('sentinel_lending', {
      did: context.did,
      amount,
      action: 'evaluate_loan_request'
    });

    const approved = result.result.action === 'approve_loan';
    const responseText = approved
      ? `✅ *Loan Approved!*\n\nAmount: $${amount} USDT\nConfidence: ${result.result.confidence}%\n\n*Reason:*\n${result.result.reasoning}`
      : `❌ *Loan Denied*\n\n*Reason:*\n${result.result.reasoning}`;

    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
    logger.info('Telegram loan request', { did: context.did, amount, approved });
  } catch (error) {
    bot.sendMessage(chatId, `❌ Request failed: ${error.message}`);
    logger.error('Telegram request failed', { error: error.message });
  }
};

/**
 * Handle /balance command.
 */
const handleBalance = async (msg) => {
  const chatId = msg.chat.id;

  try {
    const walletManager = require('../wdk/walletManager');
    const ethBal = await walletManager.getSentinelETHBalance();
    const usdtBal = await walletManager.getSentinelUSDTBalance();

    const responseText = `💰 *Sentinel Treasury*\n\nETH: ${ethBal.balance}\nUSDT: ${usdtBal.balance}`;
    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, `❌ Balance check failed: ${error.message}`);
  }
};

/**
 * Handle /help command.
 */
const handleHelp = (msg) => {
  const chatId = msg.chat.id;
  const helpText = `ℹ️ *SENTINEL Bot Commands*

/register - Register for lending
/status - Check your credit score
/request <amount> - Request a loan
/balance - Check Sentinel's balance
/help - Show this help message

*Example:*
/request 500

*Network:* Ethereum Sepolia
*Token:* USDT (ERC-20)`;

  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
};

/**
 * Handle incoming message.
 */
const handleMessage = async (msg) => {
  if (!msg || !msg.chat || !msg.text) return;

  const command = parseCommand(msg.text);

  try {
    if (command) {
      switch (command.command) {
        case 'start':
          await handleStart(msg);
          break;
        case 'register':
          await handleRegister(msg);
          break;
        case 'status':
          await handleStatus(msg);
          break;
        case 'request':
          await handleRequest(msg, command.args);
          break;
        case 'balance':
          await handleBalance(msg);
          break;
        case 'help':
          await handleHelp(msg);
          break;
        default:
          bot.sendMessage(msg.chat.id, `❓ Unknown command: /${command.command}\n\nUse /help for available commands.`);
      }
    } else {
      handleHelp(msg);
    }
  } catch (error) {
    logger.error('Error handling Telegram message', { error: error.message });
  }
};

/**
 * Handle Telegram webhook (for HTTP-based integration).
 */
const handleTelegramWebhook = async (payload) => {
  try {
    if (payload && payload.message) {
      await handleMessage(payload.message);
    }
  } catch (error) {
    logger.error('Telegram webhook error', { error: error.message });
    throw error;
  }
};

/**
 * Initialize Telegram bot.
 */
const initializeTelegram = () => {
  if (!bot) {
    logger.warn('Telegram bot not configured (missing TELEGRAM_BOT_TOKEN)');
    return false;
  }

  try {
    bot.on('message', handleMessage);
    bot.on('error', (error) => {
      logger.error('Telegram bot error', { error: error.message });
    });

    logger.info('Telegram bot initialized with polling');
    return true;
  } catch (error) {
    logger.error('Failed to initialize Telegram bot', { error: error.message });
    return false;
  }
};

/**
 * Stop Telegram bot.
 */
const stopTelegram = () => {
  if (bot) {
    bot.stopPolling();
    logger.info('Telegram bot stopped');
  }
};

// Exports
module.exports = {
  initializeTelegram,
  stopTelegram,
  bot,
  getOrCreateContext,
  handleStart,
  handleRegister,
  handleStatus,
  handleRequest,
  handleBalance,
  handleHelp,
  handleMessage,
  handleTelegramWebhook,
  parseCommand
};
