// ============================================
// SENTINEL — Capital Reallocation Service
// ============================================
// Manages Sentinel's treasury / lending pool:
//   - Tracks deployed capital vs. idle capital
//   - Detects idle USDT and routes to yield (stub for DeFi integration)
//   - Reports capital status for the /capital/status endpoint
//
// In the hackathon demo, the yield reallocation is a stub.
// In production, this would route to Aave/Compound via WDK protocols.

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
 * This is a stub — in production, query DeFi protocol rates.
 */
function getYieldOpportunities(idleCapital) {
  if (idleCapital <= 0) {
    return { available: false, reason: 'No idle capital to deploy' };
  }

  // Stub yield opportunities
  return {
    available: true,
    opportunities: [
      {
        protocol: 'Aave V3',
        asset: 'USDT',
        apy: '4.2%',
        estimatedDailyYield: parseFloat((idleCapital * 0.042 / 365).toFixed(4)),
        risk: 'low',
        note: 'Stub — WDK lending protocol integration pending'
      },
      {
        protocol: 'Compound V3',
        asset: 'USDT',
        apy: '3.8%',
        estimatedDailyYield: parseFloat((idleCapital * 0.038 / 365).toFixed(4)),
        risk: 'low',
        note: 'Stub — WDK lending protocol integration pending'
      }
    ]
  };
}

/**
 * Deploy idle capital to yield (stub for hackathon).
 * In production: use WDK's getLendingProtocol('aave') to supply USDT.
 */
async function deployToYield(amount, protocol) {
  logger.info('Capital reallocation requested', { amount, protocol });

  // Stub implementation
  return {
    status: 'simulated',
    amount,
    protocol,
    message: 'Yield deployment simulated. WDK lending protocol integration pending.',
    txHash: `0xYIELD_SIM_${Date.now().toString(16)}`
  };
}

// Export as singleton object with all methods
module.exports = {
  getCapitalStatus,
  getYieldOpportunities,
  deployToYield
};
