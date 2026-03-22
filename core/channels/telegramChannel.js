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
 * First checks memory, then MongoDB for persistence
 */
const getOrCreateContext = async (chatId, userId) => {
  const key = `tg_${chatId}`;

  // Check memory cache first
  if (userContexts.has(key)) {
    return userContexts.get(key);
  }

  // Try to load from MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      const did = `did:telegram:${userId}`;
      const agent = await Agent.findOne({ did });

      if (agent) {
        // User exists in MongoDB - load their context
        const context = {
          chatId,
          userId,
          did: agent.did,
          creditScore: agent.creditScore,
          tier: agent.tier,
          registered: true,
          registeredAt: agent.createdAt
        };
        userContexts.set(key, context);
        return context;
      }
    }
  } catch (error) {
    logger.error('Failed to load user from MongoDB', { error: error.message });
  }

  // New user - create context
  const newContext = {
    chatId,
    userId,
    did: null,
    creditScore: null,
    tier: null,
    registered: false,
    registeredAt: Date.now()
  };
  userContexts.set(key, newContext);
  return newContext;
};

/**
 * Handle /start command.
 */
const handleStart = async (msg) => {
  const chatId = msg.chat.id;
  const text = `🤖 *Welcome to SENTINEL*

I'm your autonomous lending agent powered by WDK and on-chain credit scoring.

🎯 *Quick Start:*
1️⃣ /register - Create your account
2️⃣ /status - Check your credit score
3️⃣ /request 500 - Request a loan
4️⃣ Get instant approval!
5️⃣ Receive USDT on-chain

💡 *Explore More:*
/limit - See max borrowing amount
/terms - View interest rates
/approve - Check eligibility
/history - View loan history
/balance - Treasury balance
/help - All commands

*Network:* Ethereum Sepolia
*Token:* USDT (ERC-20)

Ready? Send /register to start! 🚀`;

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
 * Handle /limit command - Show max loan amount
 */
const handleLimit = async (msg) => {
  const chatId = msg.chat.id;
  const context = await getOrCreateContext(chatId, msg.from.id);

  if (!context.did) {
    bot.sendMessage(chatId, '❌ Please /register first to see your loan limit.', { parse_mode: 'Markdown' });
    return;
  }

  const tierLimits = { 'A': 5000, 'B': 2000, 'C': 500, 'D': 0 };
  const maxLoan = tierLimits[context.tier] || 0;

  const text = `💰 *Your Loan Limit*

Tier: ${context.tier}
Credit Score: ${context.creditScore}
Maximum Loan: $${maxLoan} USDT

To request a loan, use:
/request 300

(Replace 300 with your desired amount)`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
};

/**
 * Handle /terms command - Show loan terms
 */
const handleTerms = async (msg) => {
  const chatId = msg.chat.id;
  const context = await getOrCreateContext(chatId, msg.from.id);

  if (!context.did) {
    bot.sendMessage(chatId, '❌ Please /register first to see loan terms.', { parse_mode: 'Markdown' });
    return;
  }

  const interestRates = { 'A': 3.5, 'B': 5.0, 'C': 8.0, 'D': 'N/A' };
  const rate = interestRates[context.tier] || 'N/A';
  const duration = 30;

  const text = `📋 *Your Loan Terms*

Tier: ${context.tier} (Score: ${context.creditScore})
Interest Rate: ${rate}% per annum
Loan Duration: ${duration} days
Repayment: Monthly installments
Network: Ethereum Sepolia
Token: USDT

Use /request 300 to apply for a loan!`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
};

/**
 * Handle /approve command - Check eligibility
 */
const handleApprove = async (msg) => {
  const chatId = msg.chat.id;
  const context = await getOrCreateContext(chatId, msg.from.id);

  if (!context.did) {
    bot.sendMessage(chatId, '❌ Please /register first to check eligibility.', { parse_mode: 'Markdown' });
    return;
  }

  const approved = context.tier !== 'D';
  const text = approved
    ? `✅ *You Are Eligible!*\n\nTier: ${context.tier}\nCredit Score: ${context.creditScore}\n\nYou can borrow up to your tier limit.\nUse /request 300 to apply!`
    : `❌ *Not Eligible*\n\nTier D users are not eligible for loans at this time.\nImprove your credit score to become eligible.`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
};

/**
 * Handle /history command - Show loan history
 */
const handleHistory = async (msg) => {
  const chatId = msg.chat.id;
  const context = await getOrCreateContext(chatId, msg.from.id);

  if (!context.did) {
    bot.sendMessage(chatId, '❌ Please /register first to view history.', { parse_mode: 'Markdown' });
    return;
  }

  try {
    if (mongoose.connection.readyState === 1) {
      const Loan = require('../models').Loan;
      const loans = await Loan.find({ did: context.did }).sort({ createdAt: -1 }).limit(5);

      if (loans.length === 0) {
        bot.sendMessage(chatId, '📭 *Loan History*\n\nNo loans yet. Use /request 300 to apply!', { parse_mode: 'Markdown' });
        return;
      }

      let history = '📚 *Your Loan History*\n\n';
      loans.forEach((loan, index) => {
        const status = loan.repaid ? '✅ Repaid' : '⏳ Active';
        history += `${index + 1}. $${loan.amount} USDT (${status})\n`;
        history += `   Date: ${new Date(loan.createdAt).toLocaleDateString()}\n`;
        history += `   Rate: ${loan.interestRate * 100}%\n\n`;
      });

      bot.sendMessage(chatId, history, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, '📭 No loans yet.', { parse_mode: 'Markdown' });
    }
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
};

/**
 * Handle /help command.
 */
const handleHelp = (msg) => {
  const chatId = msg.chat.id;
  const helpText = `ℹ️ *SENTINEL Bot Commands*

🎯 *Quick Start:*
/register - Create account
/status - Check credit score
/request 300 - Apply for loan

💡 *More Commands:*
/limit - See max borrowing amount
/terms - View loan interest rates
/approve - Check if eligible
/history - View past loans
/balance - Check Sentinel's balance
/help - Show this message

📱 *Example Flow:*
1. /register
2. /status
3. /request 500

💰 Network: Ethereum Sepolia | Token: USDT`;

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
        case 'limit':
        case 'howmuch':
        case 'max':
          await handleLimit(msg);
          break;
        case 'terms':
        case 'rates':
        case 'interest':
          await handleTerms(msg);
          break;
        case 'approve':
        case 'eligible':
        case 'check':
          await handleApprove(msg);
          break;
        case 'history':
        case 'loans':
        case 'past':
          await handleHistory(msg);
          break;
        case 'balance':
          await handleBalance(msg);
          break;
        case 'help':
        case 'h':
        case '?':
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
