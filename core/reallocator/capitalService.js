// ============================================
// SENTINEL — Capital Reallocation Service
// ============================================
// Manages Sentinel's treasury / lending pool:
//   - Tracks deployed capital vs. idle capital
//   - Reports capital status for the /capital/status endpoint
//   - Yield deployment ready for WDK lending protocol when available
//
// Note: Yield reallocation requires @tetherto/wdk-lending module.

const { Loan, Transaction } = require('../models');
const walletManager = require('../wdk/walletManager');
const { LOAN_STATUSES } = require('../utils/constants');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Get current capital status: reserves, deployed, and yield.
 */
async function getCapitalStatus() {
  // Get Sentinel's USDT balance
  const sentinelAddress = await walletManager.getSentinelAddress();
  const { balance: usdtBalance } = await walletManager.getUSDTBalance(sentinelAddress);
  const { balance: ethBalance } = await walletManager.getSentinelETHBalance();

  // Calculate deployed capital (all disbursed but not yet repaid loans)
  const activeLoans = await Loan.find({
    status: LOAN_STATUSES.DISBURSED
  });
  const deployedCapital = activeLoans.reduce((sum, loan) => sum + loan.amount, 0);

  // Calculate total interest earned (from repaid loans)
  const repaidLoans = await Loan.find({
    status: LOAN_STATUSES.REPAID
  });
  const totalInterestEarned = repaidLoans.reduce((sum, loan) => sum + (loan.interestAccrued || 0), 0);

  // Calculate total defaults (capital lost)
  const defaultedLoans = await Loan.find({
    status: { $in: [LOAN_STATUSES.DEFAULTED, LOAN_STATUSES.LIQUIDATED] }
  });
  const totalDefaultedAmount = defaultedLoans.reduce((sum, loan) => sum + loan.amount, 0);

  // Idle capital = USDT on hand minus enough reserve
  const idleCapital = Math.max(0, usdtBalance - config.loan.idleThreshold);

  const status = {
    sentinelAddress,
    reserves: {
      usdt: usdtBalance,
      eth: ethBalance
    },
    deployed: {
      totalActiveLoans: activeLoans.length,
      capitalDeployed: deployedCapital,
      expectedReturn: activeLoans.reduce((sum, loan) => sum + (loan.totalDue || 0), 0)
    },
    performance: {
      totalLoansIssued: repaidLoans.length + activeLoans.length + defaultedLoans.length,
      totalRepaid: repaidLoans.length,
      totalDefaulted: defaultedLoans.length,
      interestEarned: parseFloat(totalInterestEarned.toFixed(2)),
      capitalLost: totalDefaultedAmount,
      netPnL: parseFloat((totalInterestEarned - totalDefaultedAmount).toFixed(2))
    },
    reallocation: {
      idleCapital,
      idleThreshold: config.loan.idleThreshold,
      yieldOpportunities: getYieldOpportunities(idleCapital)
    }
  };

  return status;
}

/**
 * Get available yield opportunities for idle capital.
 * Queries DeFi protocol rates via WDK lending protocol integrations.
 */
async function getYieldOpportunities(idleCapital) {
  if (idleCapital <= 0) {
    return { available: false, reason: 'No idle capital to deploy' };
  }

  // WDK lending protocol integration to be implemented
  // when @tetherto/wdk-lending module is available
  return {
    available: false,
    opportunities: [],
    note: 'Yield opportunities require WDK lending protocol integration. Contact Tether for @tetherto/wdk-lending module access.'
  };
}

/**
 * Deploy idle capital to yield protocol.
 * Requires WDK lending protocol module (not yet available).
 */
async function deployToYield(amount, protocol) {
  logger.info('Capital reallocation requested', { amount, protocol });

  // WDK lending protocol integration required for yield deployment
  throw new Error(
    `Yield deployment to ${protocol} is not yet available. ` +
    'Requires @tetherto/wdk-lending module for DeFi protocol integration. ' +
    'Contact Tether for module access or implement direct protocol integration.'
  );
}

// Export as singleton object with all methods
module.exports = {
  getCapitalStatus,
  getYieldOpportunities,
  deployToYield
};
