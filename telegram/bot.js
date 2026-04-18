// ============================================
// Neurvinial — Telegram Notification Bot
// ============================================
// Sends alerts for loan lifecycle events:
//   - Loan approved/denied
//   - T-24h payment reminder
//   - Default alert
//   - Blacklist notification
//
// Uses the node-telegram-bot-api package in polling mode.
// Fails gracefully if bot token is not configured.

const TelegramBot = require('node-telegram-bot-api');
const config = require('../core/config');
const logger = require('../core/config/logger');

// ============================================
// Internal state (closure for singleton pattern)
// ============================================
const state = {
  bot: null,
  initialized: false
};

/**
 * Initialize the Telegram bot.
 * If token is not configured, bot runs in "silent mode" (logs only).
 */
function initialize() {
  if (state.initialized) return;

  if (!config.telegram.botToken) {
    logger.warn('TELEGRAM_BOT_TOKEN not set — notifications will be logged only');
    state.initialized = true;
    return;
  }

  try {
    state.bot = new TelegramBot(config.telegram.botToken, { polling: false });
    state.initialized = true;
    logger.info('Telegram bot initialized');
  } catch (err) {
    logger.error('Telegram bot initialization failed', { error: err.message });
    state.initialized = true;
  }
}

/**
 * Send a generic alert message.
 */
async function sendAlert(message) {
  initialize();

  const formattedMessage = `🏦 Neurvinial\n${'─'.repeat(20)}\n${message}`;

  // Always log the alert
  logger.info('Telegram alert', { message });

  if (!state.bot || !config.telegram.chatId) {
    return { sent: false, reason: 'Bot not configured' };
  }

  try {
    await state.bot.sendMessage(config.telegram.chatId, formattedMessage);
    return { sent: true };
  } catch (err) {
    logger.error('Telegram send failed', { error: err.message });
    return { sent: false, reason: err.message };
  }
}

/**
 * Send a loan approval notification.
 */
async function sendLoanApproved(loan) {
  return sendAlert(
    `LOAN APPROVED\n\n` +
    `Loan ID: ${loan.loanId}\n` +
    `Borrower: ${loan.borrowerDid}\n` +
    `Amount: ${loan.amount} USDT\n` +
    `Tier: ${loan.tier}\n` +
    `APR: ${(loan.apr * 100).toFixed(1)}%\n` +
    `Total Due: ${loan.totalDue} USDT\n` +
    `Due Date: ${loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'N/A'}`
  );
}

/**
 * Send a loan denial notification.
 */
async function sendLoanDenied(loan, reason) {
  return sendAlert(
    `LOAN DENIED\n\n` +
    `Loan ID: ${loan.loanId}\n` +
    `Borrower: ${loan.borrowerDid}\n` +
    `Amount Requested: ${loan.amount} USDT\n` +
    `Reason: ${reason}\n` +
    `Score: ${loan.combinedScore || 'N/A'}`
  );
}

/**
 * Send a disbursement notification.
 */
async function sendDisbursement(loan, txHash) {
  return sendAlert(
    `LOAN DISBURSED\n\n` +
    `Loan ID: ${loan.loanId}\n` +
    `Amount: ${loan.amount} USDT\n` +
    `TX Hash: ${txHash}\n` +
    `Due Date: ${new Date(loan.dueDate).toLocaleDateString()}`
  );
}

/**
 * Send a repayment confirmation.
 */
async function sendRepaymentConfirmed(loan, wasOnTime, newScore) {
  const status = wasOnTime ? 'ON TIME' : 'LATE';
  return sendAlert(
    `LOAN REPAID (${status})\n\n` +
    `Loan ID: ${loan.loanId}\n` +
    `Amount: ${loan.totalDue} USDT\n` +
    `New Credit Score: ${newScore}`
  );
}

/**
 * Send a default alert.
 */
async function sendDefaultAlert(loan, agent) {
  return sendAlert(
    `DEFAULT ALERT\n\n` +
    `Loan ID: ${loan.loanId}\n` +
    `Borrower: ${loan.borrowerDid}\n` +
    `Amount Overdue: ${loan.totalDue} USDT\n` +
    `Credit Score: ${agent.creditScore}\n` +
    `Total Defaults: ${agent.totalDefaulted}\n` +
    `Blacklisted: ${agent.isBlacklisted ? 'YES' : 'No'}`
  );
}

// Export as singleton object with all methods
module.exports = {
  initialize,
  sendAlert,
  sendLoanApproved,
  sendLoanDenied,
  sendDisbursement,
  sendRepaymentConfirmed,
  sendDefaultAlert
};
