// ============================================
// SENTINEL — LP Agent Manager (Agent-to-Agent Lending)
// ============================================
// Manages Liquidity Provider (LP) agents that supply capital to SENTINEL.
//
// SRD Requirement: FR-CP-02
// "Liquidity Pool Agent (separate WDK wallet) shall supply capital to Sentinel on request"
//
// How it works:
// 1. LP Agent registers with SENTINEL, providing capital
// 2. SENTINEL uses LP capital to fund loans to borrowers
// 3. SENTINEL repays LP with interest from borrower repayments
// 4. SENTINEL earns the spread (borrower APR - LP APR)

const { Agent, Loan } = require('../models');
const walletManager = require('../wdk/walletManager');
const logger = require('../config/logger');

// ============================================
// LP Agent Schema (in-memory for demo, would be MongoDB in prod)
// ============================================
const lpAgents = new Map();

/**
 * Register a new LP Agent
 * @param {Object} config - LP agent configuration
 * @returns {Object} Registered LP agent details
 */
async function registerLPAgent({ did, walletAddress, maxCapital, apr = 0.02, name = 'LP Agent' }) {
  if (!did || !walletAddress) {
    throw new Error('LP Agent requires DID and wallet address');
  }

  if (maxCapital < 100) {
    throw new Error('Minimum LP capital is $100 USDT');
  }

  const lpAgent = {
    id: `lp_${Date.now()}`,
    did,
    walletAddress,
    name,
    maxCapital,
    currentDeployed: 0,
    apr, // Rate SENTINEL pays to LP (2% default)
    interestEarned: 0,
    status: 'active',
    registeredAt: new Date(),
    lastActivity: new Date()
  };

  lpAgents.set(lpAgent.id, lpAgent);

  logger.info('LP Agent registered', {
    id: lpAgent.id,
    did,
    maxCapital,
    apr: `${(apr * 100).toFixed(1)}%`
  });

  return lpAgent;
}

/**
 * Request capital from LP agents
 * Called when SENTINEL treasury is low and needs to fund a loan
 * @param {number} amount - Amount needed
 * @returns {Object} Capital request result
 */
async function requestCapitalFromLP(amount) {
  // Find available LP with sufficient capital
  for (const [id, lp] of lpAgents) {
    if (lp.status !== 'active') continue;

    const available = lp.maxCapital - lp.currentDeployed;
    if (available >= amount) {
      // In production: Execute real WDK transfer from LP wallet to SENTINEL treasury
      // For demo: Track the capital deployment

      lp.currentDeployed += amount;
      lp.lastActivity = new Date();

      logger.info('Capital received from LP Agent', {
        lpId: id,
        amount,
        lpApr: `${(lp.apr * 100).toFixed(1)}%`,
        totalDeployed: lp.currentDeployed
      });

      return {
        success: true,
        lpAgentId: id,
        amount,
        apr: lp.apr,
        source: 'lp_agent'
      };
    }
  }

  return {
    success: false,
    reason: 'No LP agent with sufficient available capital'
  };
}

/**
 * Repay LP agent when borrower repays loan
 * SENTINEL keeps the spread (borrower APR - LP APR)
 * @param {string} lpAgentId - LP agent ID
 * @param {number} principal - Principal amount returned
 * @param {number} interest - Interest earned by SENTINEL
 */
async function repayLPAgent(lpAgentId, principal, interest) {
  const lp = lpAgents.get(lpAgentId);
  if (!lp) {
    logger.warn('LP Agent not found for repayment', { lpAgentId });
    return null;
  }

  // Calculate LP's share of interest
  const lpInterest = principal * lp.apr * (30 / 365); // Assuming 30-day loan
  const sentinelProfit = interest - lpInterest;

  lp.currentDeployed -= principal;
  lp.interestEarned += lpInterest;
  lp.lastActivity = new Date();

  logger.info('LP Agent repaid', {
    lpAgentId,
    principal,
    lpInterest: lpInterest.toFixed(2),
    sentinelProfit: sentinelProfit.toFixed(2)
  });

  return {
    lpAgentId,
    principalReturned: principal,
    lpInterestPaid: lpInterest,
    sentinelProfit,
    lpTotalEarned: lp.interestEarned
  };
}

/**
 * Get all LP agents with their status
 * @returns {Array} List of LP agents
 */
function getAllLPAgents() {
  return Array.from(lpAgents.values()).map(lp => ({
    id: lp.id,
    did: lp.did,
    name: lp.name,
    maxCapital: lp.maxCapital,
    currentDeployed: lp.currentDeployed,
    availableCapital: lp.maxCapital - lp.currentDeployed,
    apr: lp.apr,
    interestEarned: lp.interestEarned,
    status: lp.status,
    registeredAt: lp.registeredAt
  }));
}

/**
 * Get LP agent by ID
 * @param {string} id - LP agent ID
 * @returns {Object|null} LP agent or null
 */
function getLPAgent(id) {
  return lpAgents.get(id) || null;
}

/**
 * Calculate total available LP capital
 * @returns {number} Total available capital from all active LPs
 */
function getTotalAvailableLPCapital() {
  let total = 0;
  for (const lp of lpAgents.values()) {
    if (lp.status === 'active') {
      total += lp.maxCapital - lp.currentDeployed;
    }
  }
  return total;
}

/**
 * Get LP pool statistics
 * @returns {Object} Aggregate LP pool stats
 */
function getLPPoolStats() {
  let totalCapital = 0;
  let totalDeployed = 0;
  let totalInterestPaid = 0;
  let activeCount = 0;

  for (const lp of lpAgents.values()) {
    if (lp.status === 'active') {
      totalCapital += lp.maxCapital;
      totalDeployed += lp.currentDeployed;
      totalInterestPaid += lp.interestEarned;
      activeCount++;
    }
  }

  return {
    activeLPAgents: activeCount,
    totalCapitalCommitted: totalCapital,
    totalCapitalDeployed: totalDeployed,
    totalCapitalAvailable: totalCapital - totalDeployed,
    totalInterestPaidToLPs: totalInterestPaid,
    averageAPR: activeCount > 0 ?
      Array.from(lpAgents.values())
        .filter(lp => lp.status === 'active')
        .reduce((sum, lp) => sum + lp.apr, 0) / activeCount : 0
  };
}

// Demo: Create a default LP agent for testing
async function initializeDemoLP() {
  if (lpAgents.size === 0) {
    try {
      // Create a demo LP agent
      await registerLPAgent({
        did: 'did:lp:demo',
        walletAddress: '0xLP_DEMO_WALLET_ADDRESS',
        maxCapital: 10000,
        apr: 0.02,
        name: 'Demo LP Agent'
      });
      logger.info('Demo LP Agent initialized');
    } catch (error) {
      logger.warn('Failed to initialize demo LP', { error: error.message });
    }
  }
}

module.exports = {
  registerLPAgent,
  requestCapitalFromLP,
  repayLPAgent,
  getAllLPAgents,
  getLPAgent,
  getTotalAvailableLPCapital,
  getLPPoolStats,
  initializeDemoLP
};
