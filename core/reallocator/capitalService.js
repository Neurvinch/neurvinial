// ============================================
// SENTINEL — Capital Reallocation Service
// ============================================
// Manages Sentinel's treasury / lending pool:
//   - Tracks deployed capital vs. idle capital
//   - Reports capital status for the /capital/status endpoint
//   - Integrates LP Agent pool (FR-CP-02)
//   - Integrates AAVE for yield deployment (FR-CP-01)
//
// NO MOCKS - Uses real WDK and MongoDB only.

const { Loan, Transaction } = require('../models');
const walletManager = require('../wdk/walletManager');
const lpAgentManager = require('../capital/lpAgentManager');
const aaveIntegration = require('../capital/aaveIntegration');
const { LOAN_STATUSES } = require('../utils/constants');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Get current capital status: reserves, deployed, LP pool, and AAVE yield.
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

  // Get LP pool status
  const lpPoolStats = lpAgentManager.getLPPoolStats();

  // Get AAVE status
  const aaveStatus = await aaveIntegration.getAaveStatus();

  // Idle capital = USDT on hand minus reserve threshold
  const idleCapital = Math.max(0, usdtBalance - config.loan.idleThreshold);

  // Check if AAVE deployment is recommended
  const aaveRecommendation = aaveIntegration.shouldDeployToAave(idleCapital);

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
    lpPool: {
      activeLPAgents: lpPoolStats.activeLPAgents,
      totalCapitalCommitted: lpPoolStats.totalCapitalCommitted,
      totalCapitalDeployed: lpPoolStats.totalCapitalDeployed,
      totalCapitalAvailable: lpPoolStats.totalCapitalAvailable,
      averageAPR: (lpPoolStats.averageAPR * 100).toFixed(2) + '%',
      totalInterestPaidToLPs: lpPoolStats.totalInterestPaidToLPs
    },
    aave: {
      currentDeposit: aaveStatus.currentDeposit,
      interestEarned: aaveStatus.interestEarned,
      estimatedAPY: aaveStatus.estimatedAPY + '%',
      status: aaveStatus.status
    },
    reallocation: {
      idleCapital,
      idleThreshold: config.loan.idleThreshold,
      aaveRecommendation,
      yieldOpportunities: await aaveIntegration.getYieldOpportunities()
    }
  };

  return status;
}

/**
 * Get available yield opportunities for idle capital.
 */
async function getYieldOpportunities(idleCapital) {
  if (idleCapital <= 0) {
    return { available: false, reason: 'No idle capital to deploy' };
  }

  return aaveIntegration.getYieldOpportunities();
}

/**
 * Deploy idle capital to yield protocol (AAVE).
 */
async function deployToYield(amount, protocol = 'aave') {
  logger.info('Capital reallocation requested', { amount, protocol });

  if (protocol.toLowerCase() === 'aave') {
    return aaveIntegration.depositToAave(amount);
  }

  throw new Error(`Unknown yield protocol: ${protocol}. Supported: aave`);
}

/**
 * Withdraw capital from yield protocol.
 */
async function withdrawFromYield(amount, protocol = 'aave') {
  logger.info('Capital withdrawal from yield requested', { amount, protocol });

  if (protocol.toLowerCase() === 'aave') {
    return aaveIntegration.withdrawFromAave(amount);
  }

  throw new Error(`Unknown yield protocol: ${protocol}. Supported: aave`);
}

// Export as singleton object with all methods
module.exports = {
  getCapitalStatus,
  getYieldOpportunities,
  deployToYield,
  withdrawFromYield
};
