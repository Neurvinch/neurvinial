// ============================================
// SENTINEL — Repayment Monitor Daemon
// ============================================
// Runs on a schedule (cron). Responsibilities:
//   1. Find all disbursed loans approaching their due date
//   2. Send T-24h reminder alerts via Telegram
//   3. Mark overdue loans as defaulted
//   4. Trigger collateral liquidation for defaulted loans
//
// Can be run standalone: node core/monitor/daemon.js
// Or integrated into the main server via startMonitor()

const cron = require('node-cron');
const { Loan, Agent } = require('../models');
const loanService = require('../loans/loanService');
const { LOAN_STATUSES } = require('../utils/constants');
const logger = require('../config/logger');

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
 */
async function checkAllLoans() {
  const now = new Date();

  // Find all disbursed loans (active loans that need monitoring)
  const activeLoans = await Loan.find({
    status: LOAN_STATUSES.DISBURSED
  });

  if (activeLoans.length === 0) return;

  logger.debug(`Monitor checking ${activeLoans.length} active loan(s)`);

  for (const loan of activeLoans) {
    await checkLoan(loan, now);
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
