// ============================================
// Neurvinial — DID (Decentralized Identity) Service
// ============================================
// Generates, resolves, and verifies W3C-compatible DIDs for agents.
//
// DID format: did:sentinel:<walletAddress>
// Example:    did:sentinel:0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e
//
// Why DID? It's a W3C standard that gives each agent a globally unique,
// verifiable identity that survives beyond this hackathon.

const crypto = require('crypto');
const { Agent } = require('../core/models');
const walletManager = require('../core/wdk/walletManager');
const logger = require('../core/config/logger');

/**
 * Register a new agent. Creates:
 * 1. A WDK wallet (unique index based on agent count)
 * 2. A DID tied to that wallet address
 * 3. An Agent record in MongoDB
 */
async function registerAgent(metadata = {}) {
  // Count existing agents to determine wallet index
  const agentCount = await Agent.countDocuments();
  const walletIndex = agentCount + 1; // Index 0 is Sentinel's own wallet

  // Create wallet for this agent via WDK
  const { address } = await walletManager.createWalletForAgent(walletIndex);

  // Generate DID from the wallet address
  const did = generateDID(address);

  // Create agent record in MongoDB
  const agent = new Agent({
    did,
    walletAddress: address,
    creditScore: 50,  // Start at Tier C (Subprime)
    tier: 'C',
    metadata: {
      ...metadata,
      walletIndex
    }
  });

  await agent.save();

  logger.info('Agent registered', { did, walletAddress: address });

  return {
    did,
    walletAddress: address,
    creditScore: agent.creditScore,
    tier: agent.tier
  };
}

/**
 * Generate a DID from a wallet address.
 * Format: did:sentinel:<address>
 */
function generateDID(walletAddress) {
  return `did:sentinel:${walletAddress.toLowerCase()}`;
}

/**
 * Resolve a DID to its full agent profile.
 * Returns null if DID is not registered.
 */
async function resolveDID(did) {
  const agent = await Agent.findOne({ did });
  if (!agent) return null;

  return {
    did: agent.did,
    walletAddress: agent.walletAddress,
    creditScore: agent.creditScore,
    tier: agent.tier,
    totalLoans: agent.totalLoans,
    totalRepaid: agent.totalRepaid,
    totalDefaulted: agent.totalDefaulted,
    onTimeRate: agent.onTimeRate,
    registeredAt: agent.registeredAt,
    lastActivity: agent.lastActivity,
    isBlacklisted: agent.isBlacklisted
  };
}

/**
 * Verify that a DID is registered and not blacklisted.
 */
async function verifyDID(did) {
  const agent = await Agent.findOne({ did });

  if (!agent) {
    return { valid: false, reason: 'DID not registered' };
  }
  if (agent.isBlacklisted) {
    return { valid: false, reason: 'Agent is blacklisted' };
  }

  return { valid: true, agent };
}

/**
 * Create a DID Document (W3C-compatible structure).
 * This is what a verifier would receive when resolving the DID.
 */
function createDIDDocument(agent) {
  return {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: agent.did,
    verificationMethod: [{
      id: `${agent.did}#wallet`,
      type: 'EcdsaSecp256k1RecoveryMethod2020',
      controller: agent.did,
      blockchainAccountId: `eip155:11155111:${agent.walletAddress}`
    }],
    authentication: [`${agent.did}#wallet`],
    service: [{
      id: `${agent.did}#sentinel-credit`,
      type: 'SentinelCreditProfile',
      serviceEndpoint: `http://localhost:3000/agents/${encodeURIComponent(agent.did)}/score`
    }]
  };
}

// Export as singleton object with all methods
module.exports = {
  registerAgent,
  generateDID,
  resolveDID,
  verifyDID,
  createDIDDocument
};
