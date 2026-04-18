// ============================================
// Neurvinial — WDK Indexer Service
// ============================================
// Integrates with Tether WDK Indexer API for real on-chain data.
// Provides: transaction history, balance verification, repayment detection.
//
// Primary: WDK Indexer API (https://wdk-api.tether.io)
// Fallback: Etherscan API for Sepolia testnet
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
const INDEXER_API_KEY = process.env.WDK_INDEXER_API_KEY || 'c237be9d1b355ffac7a3eaf0442ff49643aac565b7217992aa50b60fc30c5ab7';

// Etherscan API (fallback for Sepolia)
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'YourEtherscanAPIKey';
const ETHERSCAN_SEPOLIA_URL = 'https://api-sepolia.etherscan.io/api';

// USDT Contract on Sepolia
const USDT_CONTRACT_SEPOLIA = '0xd077a400968890eacc75cdc901f0356c943e4fdb';

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
// HTTP Clients
// ============================================
const indexerClient = axios.create({
  baseURL: INDEXER_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': INDEXER_API_KEY
  }
});

const etherscanClient = axios.create({
  baseURL: ETHERSCAN_SEPOLIA_URL,
  timeout: 15000
});

// Request logging
indexerClient.interceptors.request.use((cfg) => {
  logger.debug('WDK Indexer Request', {
    method: cfg.method,
    url: cfg.url
  });
  return cfg;
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
    logger.warn('WDK Indexer Error (will try fallback)', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    });
    return Promise.reject(error);
  }
);

// ============================================
// Helper: Normalize address
// ============================================
function normalizeAddress(address) {
  if (!address) return '';
  return address.toLowerCase();
}

// ============================================
// Etherscan Fallback: Get Token Transfers
// ============================================
async function getTokenTransfersEtherscan(address) {
  try {
    const response = await etherscanClient.get('', {
      params: {
        module: 'account',
        action: 'tokentx',
        contractaddress: USDT_CONTRACT_SEPOLIA,
        address: normalizeAddress(address),
        page: 1,
        offset: 100,
        sort: 'desc',
        apikey: ETHERSCAN_API_KEY
      }
    });

    if (response.data?.status === '1' && response.data?.result) {
      // Convert Etherscan format to our standard format
      return response.data.result.map(tx => ({
        hash: tx.hash,
        from: tx.from?.toLowerCase(),
        to: tx.to?.toLowerCase(),
        value: tx.value,
        amount: parseFloat(tx.value) / 1e6, // USDT has 6 decimals
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        blockNumber: tx.blockNumber
      }));
    }

    return [];
  } catch (error) {
    logger.warn('Etherscan fallback failed', { error: error.message });
    return [];
  }
}

// ============================================
// Token Transfers API
// ============================================

/**
 * Get token transfer history for an address.
 * Primary: WDK Indexer API
 * Fallback: Etherscan API (for Sepolia)
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

  const normalizedAddress = normalizeAddress(address);

  // Try WDK Indexer first
  try {
    const params = { limit, offset };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const response = await indexerClient.get(
      `/api/v1/${chain}/${token}/${normalizedAddress}/token-transfers`,
      { params }
    );

    const transfers = response.data?.transfers || response.data || [];
    if (transfers.length > 0) {
      logger.debug('Got transfers from WDK Indexer', { count: transfers.length });
      return transfers;
    }
  } catch (wdkError) {
    logger.warn('WDK Indexer failed, trying Etherscan fallback', {
      address: normalizedAddress,
      error: wdkError.message
    });
  }

  // Fallback to Etherscan for Sepolia
  if (chain === 'ethereum-sepolia' || chain === CHAIN_IDS.sepolia) {
    logger.info('Using Etherscan fallback for token transfers');
    return await getTokenTransfersEtherscan(normalizedAddress);
  }

  // No fallback available for other chains
  return [];
}

/**
 * Get USDT token balance for an address.
 * Primary: WDK Indexer API
 * Fallback: Etherscan API (for Sepolia)
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

  const normalizedAddress = normalizeAddress(address);

  // Try WDK Indexer first
  try {
    const response = await indexerClient.get(
      `/api/v1/${chain}/${token}/${normalizedAddress}/token-balances`
    );

    const balance = response.data?.balance || '0';
    const balanceNumber = parseFloat(balance) / 1e6; // USDT has 6 decimals

    return {
      address: normalizedAddress,
      token,
      chain,
      raw: balance,
      balance: balanceNumber
    };
  } catch (wdkError) {
    logger.warn('WDK balance check failed, trying Etherscan fallback', {
      address: normalizedAddress,
      error: wdkError.message
    });
  }

  // Fallback to Etherscan for Sepolia
  if (chain === 'ethereum-sepolia' || chain === CHAIN_IDS.sepolia) {
    try {
      const response = await etherscanClient.get('', {
        params: {
          module: 'account',
          action: 'tokenbalance',
          contractaddress: USDT_CONTRACT_SEPOLIA,
          address: normalizedAddress,
          tag: 'latest',
          apikey: ETHERSCAN_API_KEY
        }
      });

      if (response.data?.status === '1') {
        const rawBalance = response.data.result || '0';
        const balanceNumber = parseFloat(rawBalance) / 1e6;

        return {
          address: normalizedAddress,
          token,
          chain,
          raw: rawBalance,
          balance: balanceNumber,
          source: 'etherscan'
        };
      }
    } catch (etherscanError) {
      logger.warn('Etherscan balance fallback failed', { error: etherscanError.message });
    }
  }

  return {
    address: normalizedAddress,
    token,
    chain,
    raw: '0',
    balance: 0,
    error: 'Could not fetch balance'
  };
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

  const normalizedFrom = from ? normalizeAddress(from) : null;
  const normalizedTo = to ? normalizeAddress(to) : null;

  // Try WDK Indexer first
  try {
    const response = await indexerClient.get(
      `/api/v1/${chain}/transactions/${txHash}`
    );

    const tx = response.data;
    if (tx) {
      return verifyTxData(tx, { from: normalizedFrom, to: normalizedTo, minAmount, txHash });
    }
  } catch (wdkError) {
    logger.warn('WDK TX verification failed, trying Etherscan', {
      txHash,
      error: wdkError.message
    });
  }

  // Fallback to Etherscan for Sepolia
  if (chain === 'ethereum-sepolia' || chain === CHAIN_IDS.sepolia) {
    try {
      const response = await etherscanClient.get('', {
        params: {
          module: 'proxy',
          action: 'eth_getTransactionReceipt',
          txhash: txHash,
          apikey: ETHERSCAN_API_KEY
        }
      });

      if (response.data?.result) {
        const receipt = response.data.result;

        // Also get the transaction for value
        const txResponse = await etherscanClient.get('', {
          params: {
            module: 'proxy',
            action: 'eth_getTransactionByHash',
            txhash: txHash,
            apikey: ETHERSCAN_API_KEY
          }
        });

        const txData = txResponse.data?.result || {};

        // For token transfers, we need to check logs
        // Look for USDT Transfer event in logs
        let transferAmount = 0;
        let transferFrom = txData.from?.toLowerCase();
        let transferTo = '';

        if (receipt.logs && receipt.logs.length > 0) {
          for (const log of receipt.logs) {
            // USDT Transfer event topic
            if (log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
              if (log.address?.toLowerCase() === USDT_CONTRACT_SEPOLIA.toLowerCase()) {
                transferFrom = '0x' + log.topics[1]?.slice(26);
                transferTo = '0x' + log.topics[2]?.slice(26);
                transferAmount = parseInt(log.data, 16) / 1e6;
                break;
              }
            }
          }
        }

        const tx = {
          hash: txHash,
          from: transferFrom,
          to: transferTo,
          amount: transferAmount,
          status: receipt.status === '0x1' ? 'success' : 'failed',
          source: 'etherscan'
        };

        return verifyTxData(tx, { from: normalizedFrom, to: normalizedTo, minAmount, txHash });
      }
    } catch (etherscanError) {
      logger.warn('Etherscan TX verification failed', { error: etherscanError.message });
    }
  }

  return {
    verified: false,
    reason: 'Could not verify transaction - API unavailable',
    txHash
  };
}

// Helper function to verify transaction data
function verifyTxData(tx, { from, to, minAmount, txHash }) {
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
    const txAmount = parseFloat(tx.amount || tx.value || '0');
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
    amount: parseFloat(tx.amount || tx.value || '0'),
    from: tx.from,
    to: tx.to,
    timestamp: tx.timestamp || tx.blockTimestamp,
    source: tx.source || 'wdk'
  };
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
