// ============================================
// SENTINEL — WDK Indexer Service
// ============================================
// Integrates with Tether WDK Indexer API for real on-chain data.
// Provides: transaction history, balance verification, repayment detection.
//
// Base URL: https://wdk-api.tether.io
// Auth: x-api-key header
//
// SRD Requirements:
// - FR-ID-03: Persist on-chain transaction history per DID
// - FR-MN-01: Monitor daemon polls WDK Indexer API

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');

// ============================================
// Configuration
// ============================================
const INDEXER_BASE_URL = process.env.WDK_INDEXER_URL || 'https://wdk-api.tether.io';
const INDEXER_API_KEY = process.env.WDK_INDEXER_API_KEY || '';

// Chain identifiers
const CHAIN_IDS = {
  mainnet: 'ethereum',
  sepolia: 'ethereum-sepolia',
  polygon: 'polygon',
  arbitrum: 'arbitrum'
};

// Token identifiers
const TOKEN_IDS = {
  USDT: 'usdt',
  USDC: 'usdc',
  XAUt: 'xaut'
};

// ============================================
// HTTP Client
// ============================================
const indexerClient = axios.create({
  baseURL: INDEXER_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': INDEXER_API_KEY
  }
});

// Request logging
indexerClient.interceptors.request.use((config) => {
  logger.debug('WDK Indexer Request', {
    method: config.method,
    url: config.url
  });
  return config;
});

// Response logging
indexerClient.interceptors.response.use(
  (response) => {
    logger.debug('WDK Indexer Response', {
      status: response.status,
      url: response.config.url
    });
    return response;
  },
  (error) => {
    logger.error('WDK Indexer Error', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    });
    return Promise.reject(error);
  }
);

// ============================================
// Token Transfers API
// ============================================

/**
 * Get token transfer history for an address.
 * Endpoint: GET /api/v1/{chain}/{token}/{address}/token-transfers
 *
 * @param {string} address - Wallet address
 * @param {object} options - Query options
 * @returns {Promise<Array>} Transfer history
 */
async function getTokenTransfers(address, options = {}) {
  const {
    chain = CHAIN_IDS[config.wdk?.network] || CHAIN_IDS.sepolia,
    token = TOKEN_IDS.USDT,
    limit = 100,
    offset = 0,
    startDate,
    endDate
  } = options;

  try {
    const params = { limit, offset };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const response = await indexerClient.get(
      `/api/v1/${chain}/${token}/${address}/token-transfers`,
      { params }
    );

    return response.data?.transfers || response.data || [];
  } catch (error) {
    logger.error('Failed to get token transfers', {
      address,
      error: error.message
    });

    // Return empty array on error (graceful degradation)
    return [];
  }
}

/**
 * Get USDT token balance for an address via Indexer API.
 * Endpoint: GET /api/v1/{chain}/{token}/{address}/token-balances
 *
 * @param {string} address - Wallet address
 * @param {object} options - Query options
 * @returns {Promise<object>} Balance info
 */
async function getTokenBalance(address, options = {}) {
  const {
    chain = CHAIN_IDS[config.wdk?.network] || CHAIN_IDS.sepolia,
    token = TOKEN_IDS.USDT
  } = options;

  try {
    const response = await indexerClient.get(
      `/api/v1/${chain}/${token}/${address}/token-balances`
    );

    const balance = response.data?.balance || '0';
    const balanceNumber = parseFloat(balance) / 1e6; // USDT has 6 decimals

    return {
      address,
      token,
      chain,
      raw: balance,
      balance: balanceNumber
    };
  } catch (error) {
    logger.error('Failed to get token balance via indexer', {
      address,
      error: error.message
    });

    return {
      address,
      token,
      chain,
      raw: '0',
      balance: 0,
      error: error.message
    };
  }
}

/**
 * Batch fetch token transfers for multiple addresses.
 * Endpoint: POST /api/v1/batch/token-transfers
 *
 * @param {Array<string>} addresses - List of wallet addresses
 * @param {object} options - Query options
 * @returns {Promise<object>} Map of address to transfers
 */
async function batchGetTokenTransfers(addresses, options = {}) {
  const {
    chain = CHAIN_IDS[config.wdk?.network] || CHAIN_IDS.sepolia,
    token = TOKEN_IDS.USDT,
    limit = 50
  } = options;

  try {
    const response = await indexerClient.post(
      '/api/v1/batch/token-transfers',
      {
        chain,
        token,
        addresses,
        limit
      }
    );

    return response.data || {};
  } catch (error) {
    logger.error('Batch token transfers failed', {
      addressCount: addresses.length,
      error: error.message
    });

    return {};
  }
}

// ============================================
// Transaction Verification
// ============================================

/**
 * Verify a transaction hash on-chain.
 * Checks if a specific TX exists and matches expected parameters.
 *
 * @param {string} txHash - Transaction hash
 * @param {object} expected - Expected transaction details
 * @returns {Promise<object>} Verification result
 */
async function verifyTransaction(txHash, expected = {}) {
  const {
    from,
    to,
    minAmount,
    token = TOKEN_IDS.USDT,
    chain = CHAIN_IDS[config.wdk?.network] || CHAIN_IDS.sepolia
  } = expected;

  try {
    // Get transaction details from indexer
    const response = await indexerClient.get(
      `/api/v1/${chain}/transactions/${txHash}`
    );

    const tx = response.data;

    if (!tx) {
      return {
        verified: false,
        reason: 'Transaction not found',
        txHash
      };
    }

    // Verify sender
    if (from && tx.from?.toLowerCase() !== from.toLowerCase()) {
      return {
        verified: false,
        reason: `Sender mismatch: expected ${from}, got ${tx.from}`,
        txHash,
        transaction: tx
      };
    }

    // Verify recipient
    if (to && tx.to?.toLowerCase() !== to.toLowerCase()) {
      return {
        verified: false,
        reason: `Recipient mismatch: expected ${to}, got ${tx.to}`,
        txHash,
        transaction: tx
      };
    }

    // Verify amount
    if (minAmount) {
      const txAmount = parseFloat(tx.amount || tx.value || '0') / 1e6;
      if (txAmount < minAmount) {
        return {
          verified: false,
          reason: `Amount too low: expected ${minAmount}, got ${txAmount}`,
          txHash,
          transaction: tx
        };
      }
    }

    return {
      verified: true,
      txHash,
      transaction: tx,
      amount: parseFloat(tx.amount || tx.value || '0') / 1e6,
      from: tx.from,
      to: tx.to,
      timestamp: tx.timestamp || tx.blockTimestamp
    };
  } catch (error) {
    logger.error('Transaction verification failed', {
      txHash,
      error: error.message
    });

    return {
      verified: false,
      reason: `Verification error: ${error.message}`,
      txHash
    };
  }
}

/**
 * Check if a repayment transaction exists.
 * Looks for transfers to treasury from a specific address.
 *
 * @param {string} borrowerAddress - Borrower's wallet address
 * @param {string} treasuryAddress - Treasury wallet address
 * @param {number} expectedAmount - Expected repayment amount
 * @param {Date} sinceDate - Only check transfers after this date
 * @returns {Promise<object>} Repayment detection result
 */
async function detectRepayment(borrowerAddress, treasuryAddress, expectedAmount, sinceDate) {
  try {
    // Get recent transfers to treasury
    const transfers = await getTokenTransfers(treasuryAddress, {
      limit: 100,
      startDate: sinceDate?.toISOString()
    });

    // Look for matching transfer from borrower
    const matchingTransfer = transfers.find(tx => {
      const txFrom = tx.from?.toLowerCase();
      const txAmount = parseFloat(tx.amount || tx.value || '0') / 1e6;
      const amountMatch = Math.abs(txAmount - expectedAmount) < 0.01; // Allow $0.01 variance

      return txFrom === borrowerAddress.toLowerCase() && amountMatch;
    });

    if (matchingTransfer) {
      return {
        detected: true,
        txHash: matchingTransfer.hash || matchingTransfer.txHash,
        amount: parseFloat(matchingTransfer.amount || matchingTransfer.value || '0') / 1e6,
        from: matchingTransfer.from,
        timestamp: matchingTransfer.timestamp || matchingTransfer.blockTimestamp,
        transaction: matchingTransfer
      };
    }

    return {
      detected: false,
      reason: 'No matching repayment found',
      borrowerAddress,
      expectedAmount
    };
  } catch (error) {
    logger.error('Repayment detection failed', {
      borrowerAddress,
      treasuryAddress,
      error: error.message
    });

    return {
      detected: false,
      reason: `Detection error: ${error.message}`,
      borrowerAddress,
      expectedAmount
    };
  }
}

// ============================================
// Credit Score Features
// ============================================

/**
 * Extract ML features from transaction history.
 * Used for credit scoring based on on-chain behavior.
 *
 * @param {string} address - Wallet address
 * @param {number} days - Number of days to analyze
 * @returns {Promise<object>} ML features
 */
async function extractCreditFeatures(address, days = 90) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const transfers = await getTokenTransfers(address, {
      startDate: startDate.toISOString(),
      limit: 500
    });

    if (transfers.length === 0) {
      return {
        onTimeRate: 0,
        loanFrequency: 0,
        avgDuration: 0,
        collateralRatio: 0,
        txVelocity: 0,
        walletAgeDays: 0,
        hasHistory: false
      };
    }

    // Calculate features
    const incomingTx = transfers.filter(tx =>
      tx.to?.toLowerCase() === address.toLowerCase()
    );
    const outgoingTx = transfers.filter(tx =>
      tx.from?.toLowerCase() === address.toLowerCase()
    );

    // Transaction velocity (tx per 30 days)
    const txVelocity = Math.round(transfers.length * (30 / days));

    // Wallet age (days since first transaction)
    const timestamps = transfers
      .map(tx => new Date(tx.timestamp || tx.blockTimestamp))
      .filter(d => !isNaN(d.getTime()));
    const oldestTx = timestamps.length > 0 ? Math.min(...timestamps.map(d => d.getTime())) : Date.now();
    const walletAgeDays = Math.floor((Date.now() - oldestTx) / (24 * 60 * 60 * 1000));

    // Calculate total volume
    const totalVolume = transfers.reduce((sum, tx) => {
      const amount = parseFloat(tx.amount || tx.value || '0') / 1e6;
      return sum + amount;
    }, 0);

    return {
      onTimeRate: 0.8, // Would need loan data to calculate precisely
      loanFrequency: incomingTx.length,
      avgDuration: 30, // Default assumption
      collateralRatio: 0.5, // Would need collateral data
      txVelocity,
      walletAgeDays,
      totalTransactions: transfers.length,
      totalVolume,
      incomingCount: incomingTx.length,
      outgoingCount: outgoingTx.length,
      hasHistory: true
    };
  } catch (error) {
    logger.error('Feature extraction failed', {
      address,
      error: error.message
    });

    return {
      onTimeRate: 0,
      loanFrequency: 0,
      avgDuration: 0,
      collateralRatio: 0,
      txVelocity: 0,
      walletAgeDays: 0,
      hasHistory: false,
      error: error.message
    };
  }
}

// ============================================
// Exports
// ============================================
module.exports = {
  // Token data
  getTokenTransfers,
  getTokenBalance,
  batchGetTokenTransfers,

  // Verification
  verifyTransaction,
  detectRepayment,

  // Credit features
  extractCreditFeatures,

  // Constants
  CHAIN_IDS,
  TOKEN_IDS,
  INDEXER_BASE_URL
};
