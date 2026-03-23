// ============================================
// SENTINEL — Repayment Monitor Daemon
// ============================================
// Runs on a schedule (cron). Responsibilities:
//   1. Find all disbursed loans approaching their due date
//   2. Send T-24h reminder alerts via Telegram
//   3. Mark overdue loans as defaulted
//   4. Trigger collateral liquidation for defaulted loans
//   5. AUTONOMOUS on-chain repayment detection via WDK Indexer API
//
// Can be run standalone: node core/monitor/daemon.js
// Or integrated into the main server via startMonitor()

const cron = require('node-cron');
const { Loan, Agent } = require('../models');
const loanService = require('../loans/loanService');
const { LOAN_STATUSES } = require('../utils/constants');
const logger = require('../config/logger');
const walletManager = require('../wdk/walletManager');

// Import indexer service for on-chain data
let indexerService = null;
function getIndexerService() {
  if (!indexerService) {
    try {
      indexerService = require('../wdk/indexerService');
    } catch (e) {
      logger.warn('Indexer service not available', { error: e.message });
    }
  }
  return indexerService;
}

// Import telegram bot lazily (may not be configured yet)
let telegramBot = null;
function getTelegramBot() {
  if (!telegramBot) {
    try {
      telegramBot = require('../../telegram/bot');
    } catch (e) {
      // Telegram not configured — that's OK
    }
  }
  return telegramBot;
}

// Import WhatsApp channel for notifications
let whatsappChannel = null;
function getWhatsAppChannel() {
  if (!whatsappChannel) {
    try {
      whatsappChannel = require('../channels/whatsappChannel');
    } catch (e) {
      // WhatsApp not configured - OK
    }
  }
  return whatsappChannel;
}

// Track last checked balance to detect new incoming transfers
let lastKnownBalance = null;
// Track last check timestamp for indexer queries
let lastIndexerCheck = null;

// ============================================
// Internal state (closure for singleton pattern)
// ============================================
const state = {
  isRunning: false,
  cronJob: null
};

/**
 * Start the monitor on a cron schedule.
 * Default: every minute. In production, adjust to every 5-15 minutes.
 */
function start(cronExpression = '* * * * *') {
  if (state.isRunning) {
    logger.warn('Repayment monitor is already running');
    return;
  }

  state.cronJob = cron.schedule(cronExpression, async () => {
    try {
      await checkAllLoans();
    } catch (err) {
      logger.error('Monitor cycle failed', { error: err.message });
    }
  });

  state.isRunning = true;
  lastIndexerCheck = new Date(Date.now() - 60 * 60 * 1000); // Start checking 1 hour back
  logger.info('Repayment monitor started', { schedule: cronExpression });
}

/**
 * Stop the monitor.
 */
function stop() {
  if (state.cronJob) {
    state.cronJob.stop();
    state.isRunning = false;
    logger.info('Repayment monitor stopped');
  }
}

/**
 * Main check cycle: scan all active loans and take action.
 * Also checks for on-chain repayments autonomously.
 */
async function checkAllLoans() {
  const now = new Date();

  // Find all disbursed loans (active loans that need monitoring)
  const activeLoans = await Loan.find({
    status: LOAN_STATUSES.DISBURSED
  });

  if (activeLoans.length === 0) return;

  logger.debug(`Monitor checking ${activeLoans.length} active loan(s)`);

  // Check for on-chain repayments FIRST (autonomous detection)
  await checkForRepayments(activeLoans);

  // Also check via indexer for more robust detection
  await checkRepaymentsViaIndexer(activeLoans);

  // Then check due dates and send alerts
  for (const loan of activeLoans) {
    await checkLoan(loan, now);
  }
}

/**
 * Check for on-chain repayments by monitoring treasury USDT balance.
 * If balance increased, match it against outstanding loans.
 * This makes repayment detection autonomous (no /repay command needed)!
 */
async function checkForRepayments(activeLoans) {
  try {
    // Check if WDK is initialized
    if (!walletManager.isInitialized()) {
      logger.debug('WDK not initialized - skipping on-chain repayment check');
      return;
    }

    // Get current treasury balance
    const currentBalance = await walletManager.getSentinelUSDTBalance();
    const currentAmount = currentBalance.balance;

    // First run - just store the balance
    if (lastKnownBalance === null) {
      lastKnownBalance = currentAmount;
      return;
    }

    // Check if balance increased (incoming transfer)
    const balanceIncrease = currentAmount - lastKnownBalance;

    if (balanceIncrease > 0.01) { // Ignore dust (< 1 cent)
      logger.info('Treasury balance increased - checking for loan repayments', {
        previousBalance: lastKnownBalance,
        currentBalance: currentAmount,
        increase: balanceIncrease
      });

      // Try to match balance increase to outstanding loans
      await matchIncomingTransferToLoans(balanceIncrease, activeLoans);
    }

    // Update last known balance
    lastKnownBalance = currentAmount;

  } catch (error) {
    logger.error('Failed to check for on-chain repayments', { error: error.message });
  }
}

/**
 * Check for repayments via WDK Indexer API.
 * More robust detection by querying actual transaction history.
 */
async function checkRepaymentsViaIndexer(activeLoans) {
  try {
    const indexer = getIndexerService();
    if (!indexer) {
      return; // Indexer not available
    }

    if (!walletManager.isInitialized()) {
      return; // WDK not ready
    }

    const treasuryAddress = await walletManager.getSentinelAddress();

    for (const loan of activeLoans) {
      // Get borrower's wallet address
      const agent = await Agent.findOne({ did: loan.borrowerDid });
      if (!agent || !agent.walletAddress) continue;

      // Use indexer to detect repayment
      const detection = await indexer.detectRepayment(
        agent.walletAddress,
        treasuryAddress,
        loan.totalDue || loan.amount,
        loan.disbursedAt || loan.createdAt
      );

      if (detection.detected) {
        logger.info('Indexer detected on-chain repayment!', {
          loanId: loan.loanId,
          txHash: detection.txHash,
          amount: detection.amount
        });

        try {
          // Mark loan as repaid with the detected TX hash
          const result = await loanService.markRepaid(loan.loanId, detection.txHash);

          // Send notification via Telegram
          await sendRepaymentNotification(loan, result, detection);

          logger.info('Loan auto-repaid via indexer detection', {
            loanId: loan.loanId,
            txHash: detection.txHash
          });
        } catch (error) {
          logger.error('Failed to process indexer-detected repayment', {
            loanId: loan.loanId,
            error: error.message
          });
        }
      }
    }

    // Update last indexer check time
    lastIndexerCheck = new Date();

  } catch (error) {
    logger.error('Indexer repayment check failed', { error: error.message });
  }
}

/**
 * Match an incoming USDT transfer to outstanding loans.
 * Strategy: Find loan where totalDue ≈ transfer amount (within 1% tolerance)
 */
async function matchIncomingTransferToLoans(transferAmount, activeLoans) {
  const TOLERANCE = 0.01; // 1% tolerance for rounding errors

  for (const loan of activeLoans) {
    const expectedAmount = loan.totalDue || loan.amount;
    const difference = Math.abs(transferAmount - expectedAmount);
    const percentDiff = difference / expectedAmount;

    // Match found!
    if (percentDiff < TOLERANCE) {
      logger.info('Matched incoming transfer to loan - auto-marking as repaid!', {
        loanId: loan.loanId,
        expectedAmount,
        receivedAmount: transferAmount,
        borrower: loan.borrowerDid
      });

      try {
        // Mark loan as repaid (same as /repay command)
        const result = await loanService.markRepaid(loan.loanId);

        // Send notification
        await sendRepaymentNotification(loan, result, { amount: transferAmount });

        logger.info('Loan auto-repaid successfully', { loanId: loan.loanId });

        // Found a match - stop looking
        break;

      } catch (error) {
        logger.error('Failed to auto-mark loan as repaid', {
          loanId: loan.loanId,
          error: error.message
        });
      }
    }
  }
}

/**
 * Send repayment notification via Telegram and WhatsApp.
 */
async function sendRepaymentNotification(loan, result, detection) {
  const message = `✅ *REPAYMENT DETECTED ON-CHAIN!*

💰 *Loan:* ${loan.loanId.substring(0, 16)}...
👤 *Borrower:* ${loan.borrowerDid.substring(0, 25)}...
💵 *Amount:* ${detection.amount?.toFixed(2) || loan.totalDue} USDT
${detection.txHash ? `⛓️ *TX Hash:* ${detection.txHash.substring(0, 20)}...` : ''}
⏰ *Status:* ${result.wasOnTime ? 'ON-TIME ✅' : 'LATE ⚠️'}
📈 *Credit Score:* ${result.newCreditScore} (${result.creditScoreChange >= 0 ? '+' : ''}${result.creditScoreChange})
🏆 *Tier:* ${result.newTier}

🎉 Autonomous repayment detection working!`;

  // Send via Telegram
  const bot = getTelegramBot();
  if (bot && typeof bot.sendAlert === 'function') {
    try {
      await bot.sendAlert(message);
    } catch (e) {
      logger.warn('Telegram alert failed', { error: e.message });
    }
  }

  // Also send via WhatsApp if borrower has a phone number
  const whatsapp = getWhatsAppChannel();
  if (whatsapp && loan.borrowerDid.includes('whatsapp:')) {
    try {
      const phoneNumber = loan.borrowerDid.replace('did:whatsapp:', '');
      await whatsapp.sendWhatsAppMessage(phoneNumber, message.replace(/\*/g, ''));
    } catch (e) {
      logger.warn('WhatsApp notification failed', { error: e.message });
    }
  }
}

/**
 * Check a single loan and take appropriate action.
 */
async function checkLoan(loan, now) {
  const msUntilDue = loan.dueDate.getTime() - now.getTime();
  const hoursUntilDue = msUntilDue / (1000 * 60 * 60);

  // ---- Case 1: OVERDUE — Mark as defaulted ----
  if (msUntilDue <= 0) {
    logger.warn('Loan overdue — marking as defaulted', {
      loanId: loan.loanId,
      dueDate: loan.dueDate,
      overdueBy: `${Math.abs(Math.round(hoursUntilDue))} hours`
    });

    const result = await loanService.markDefault(loan.loanId);

    // Send default alert via Telegram
    const bot = getTelegramBot();
    if (bot) {
      await bot.sendAlert(
        `DEFAULT ALERT\n` +
        `Loan: ${loan.loanId}\n` +
        `Borrower: ${loan.borrowerDid}\n` +
        `Amount Due: ${loan.totalDue} USDT\n` +
        `Overdue by: ${Math.abs(Math.round(hoursUntilDue))} hours\n` +
        `Credit Score: ${result.agent.creditScore}\n` +
        `Blacklisted: ${result.agent.isBlacklisted}`
      );
    }

    // Record alert on the loan
    await Loan.updateOne(
      { loanId: loan.loanId },
      { $push: { alerts: { type: 'default', sentAt: now, channel: 'telegram' } } }
    );
  }

  // ---- Case 2: T-24h — Send reminder ----
  else if (hoursUntilDue <= 24 && hoursUntilDue > 0) {
    // Check if we already sent a T-24h reminder
    const alreadySent = loan.alerts?.some(a => a.type === 'reminder_24h');

    if (!alreadySent) {
      logger.info('Sending T-24h reminder', {
        loanId: loan.loanId,
        hoursUntilDue: Math.round(hoursUntilDue)
      });

      const bot = getTelegramBot();
      if (bot) {
        await bot.sendAlert(
          `PAYMENT REMINDER\n` +
          `Loan: ${loan.loanId}\n` +
          `Borrower: ${loan.borrowerDid}\n` +
          `Amount Due: ${loan.totalDue} USDT\n` +
          `Due in: ${Math.round(hoursUntilDue)} hours\n` +
          `Due Date: ${loan.dueDate.toISOString()}`
        );
      }

      // Record the alert
      await Loan.updateOne(
        { loanId: loan.loanId },
        { $push: { alerts: { type: 'reminder_24h', sentAt: now, channel: 'telegram' } } }
      );
    }
  }
}

// Export as singleton object with all methods
module.exports = {
  start,
  stop,
  checkAllLoans,
  checkLoan
};
