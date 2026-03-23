// ============================================
// Neurvinial — Agent-to-Agent Lending Service
// ============================================
// Enables a second agent (Liquidity Pool Agent) to provide capital
// to Sentinel when reserves run low. This creates a two-tier market:
//
//   LP Agent → Sentinel (borrows at 2% APR)
//   Sentinel → Borrower Agents (lends at 4-18% APR based on tier)
//   Sentinel earns the spread
//
// This is the "agent-to-agent lending" bonus feature.

const { Loan, Transaction } = require('../models');
const capitalService = require('../reallocator/capitalService');
const walletManager = require('../wdk/walletManager');
const logger = require('../config/logger');

// ============================================
// Internal state (closure for singleton pattern)
// ============================================
const state = {
  lpAgents: [] // Registered liquidity providers
};

/**
 * Register a Liquidity Pool Agent that can provide capital to Sentinel.
 */
function registerLPAgent({ did, walletAddress, maxCapital, apr = 0.02 }) {
  const lpAgent = {
    did,
    walletAddress,
    maxCapital,
    apr,                    // Rate LP charges Sentinel (default 2%)
    capitalProvided: 0,
    registeredAt: new Date()
  };

  state.lpAgents.push(lpAgent);

  logger.info('LP Agent registered', { did, walletAddress, maxCapital, apr });

  return lpAgent;
}

/**
 * Request capital from LP Agents when Sentinel's reserves are low.
 * This is the "recursive agent economy" from the project doc.
 */
async function requestCapital(amount) {
  // Check current capital status
  const status = await capitalService.getCapitalStatus();
  const availableReserves = status.reserves.usdt;

  logger.info('Capital request initiated', {
    requested: amount,
    currentReserves: availableReserves,
    lpAgentCount: state.lpAgents.length
  });

  if (state.lpAgents.length === 0) {
    return {
      success: false,
      reason: 'No LP agents registered',
      suggestion: 'Register an LP agent via POST /capital/lp/register'
    };
  }

  // Find LP agent with available capacity
  const lpAgent = state.lpAgents.find(lp =>
    (lp.maxCapital - lp.capitalProvided) >= amount
  );

  if (!lpAgent) {
    return {
      success: false,
      reason: 'No LP agent has sufficient available capital',
      lpAgents: state.lpAgents.map(lp => ({
        did: lp.did,
        available: lp.maxCapital - lp.capitalProvided
      }))
    };
  }

  // Simulate capital transfer from LP to Sentinel
  const txHash = `0xA2A_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;

  lpAgent.capitalProvided += amount;

  logger.info('Capital received from LP Agent', {
    lpDid: lpAgent.did,
    amount,
    txHash,
    apr: lpAgent.apr,
    totalProvided: lpAgent.capitalProvided
  });

  return {
    success: true,
    source: lpAgent.did,
    amount,
    apr: lpAgent.apr,
    txHash,
    spread: {
      explanation: `Sentinel borrows at ${(lpAgent.apr * 100)}% and lends at 4-18%. The spread is profit.`,
      minSpread: `${((0.04 - lpAgent.apr) * 100).toFixed(1)}% (Tier A)`,
      maxSpread: `${((0.18 - lpAgent.apr) * 100).toFixed(1)}% (Tier C)`
    }
  };
}

/**
 * Get status of all LP agents and capital flows.
 */
function getLPStatus() {
  return {
    lpAgents: state.lpAgents.map(lp => ({
      did: lp.did,
      walletAddress: lp.walletAddress,
      maxCapital: lp.maxCapital,
      capitalProvided: lp.capitalProvided,
      available: lp.maxCapital - lp.capitalProvided,
      apr: lp.apr,
      registeredAt: lp.registeredAt
    })),
    totalCapitalFromLPs: state.lpAgents.reduce((sum, lp) => sum + lp.capitalProvided, 0),
    totalAvailableFromLPs: state.lpAgents.reduce((sum, lp) => sum + (lp.maxCapital - lp.capitalProvided), 0)
  };
}

// Export as singleton object with all methods
module.exports = {
  registerLPAgent,
  requestCapital,
  getLPStatus
};
