// ============================================
// SENTINEL — WDK ERC-4337 Wallet Manager
// ============================================
// Account Abstraction support for gasless transactions.
// Uses ERC-4337 standard with UserOperations, paymasters, and bundlers.
//
// Benefits:
//   - Gasless transactions (paymaster covers gas fees)
//   - Batch operations
//   - Social recovery
//   - Custom transaction validation logic
//
// This is a BONUS feature demonstrating advanced WDK capabilities.

const WDK = require('@tetherto/wdk').default || require('@tetherto/wdk');
const config = require('../config');
const logger = require('../config/logger');

// Try to import ERC-4337 module (may not be available)
let WalletManagerErc4337;
try {
  WalletManagerErc4337 = require('@tetherto/wdk-wallet-evm-erc4337').default ||
                          require('@tetherto/wdk-wallet-evm-erc4337');
} catch (err) {
  logger.warn('ERC-4337 module not available. Install @tetherto/wdk-wallet-evm-erc4337 for gasless transaction support.');
}

// ============================================
// Internal state (closure for singleton pattern)
// ============================================
const state = {
  wdk: null,
  smartAccount: null,
  initialized: false,
  available: false
};

// ============================================
// Configuration
// ============================================
// These would be configured based on your bundler/paymaster provider
const AA_CONFIG = {
  bundlerUrl: process.env.BUNDLER_URL || 'https://bundler.example.com',
  paymasterUrl: process.env.PAYMASTER_URL || 'https://paymaster.example.com',
  entryPointAddress: process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // ERC-4337 v0.6 EntryPoint
  factoryAddress: process.env.FACTORY_ADDRESS || null, // Safe factory address
  fallbackHandler: process.env.FALLBACK_HANDLER || null
};

/**
 * Initialize the ERC-4337 wallet manager.
 * This creates a smart contract wallet (account abstraction).
 */
async function initialize() {
  if (state.initialized) return;

  if (!WalletManagerErc4337) {
    logger.info('ERC-4337 support not available — AA features disabled');
    state.initialized = true;
    state.available = false;
    return;
  }

  if (!config.wdk.seedPhrase) {
    logger.warn('WDK_SEED_PHRASE not configured — ERC-4337 wallet operations cannot be initialized');
    state.initialized = true;
    state.available = false;
    return;
  }

  try {
    // Create WDK instance with ERC-4337 wallet manager
    state.wdk = new WDK(config.wdk.seedPhrase)
      .registerWallet('ethereum-aa', WalletManagerErc4337, {
        provider: config.wdk.rpcUrl,
        bundlerUrl: AA_CONFIG.bundlerUrl,
        paymasterUrl: AA_CONFIG.paymasterUrl,
        entryPoint: AA_CONFIG.entryPointAddress,
        factory: AA_CONFIG.factoryAddress,
        fallbackHandler: AA_CONFIG.fallbackHandler
      });

    // Get the smart account (index 0)
    state.smartAccount = await state.wdk.getAccount('ethereum-aa', 0);
    const address = await state.smartAccount.getAddress();

    logger.info('ERC-4337 wallet initialized', {
      smartAccountAddress: address,
      bundler: AA_CONFIG.bundlerUrl,
      paymaster: AA_CONFIG.paymasterUrl
    });

    state.initialized = true;
    state.available = true;
  } catch (err) {
    logger.warn('ERC-4337 initialization failed, AA features disabled', { error: err.message });
    state.initialized = true;
    state.available = false;
  }
}

/**
 * Check if ERC-4337 is available.
 */
function isAvailable() {
  return state.available;
}

/**
 * Get the smart account address.
 */
async function getSmartAccountAddress() {
  if (!state.smartAccount) {
    throw new Error('ERC-4337 wallet not initialized');
  }
  return state.smartAccount.getAddress();
}

/**
 * Send gasless USDT transfer using a paymaster.
 * The paymaster covers the gas fees, so the user doesn't need ETH.
 */
async function sendGaslessUSDT(recipientAddress, amount, paymasterData = null) {
  if (!state.smartAccount) {
    throw new Error('ERC-4337 wallet not initialized');
  }

  const usdtContract = require('./walletManager').USDT_CONTRACTS[config.wdk.network];
  const amountInBaseUnits = BigInt(Math.round(amount * 1e6));

  try {
    // Create UserOperation for ERC20 transfer
    const userOp = await state.smartAccount.createUserOperation({
      target: usdtContract,
      data: encodeERC20Transfer(recipientAddress, amountInBaseUnits),
      value: 0
    });

    // Request paymaster sponsorship (paymaster pays gas)
    if (paymasterData) {
      userOp.paymasterAndData = paymasterData;
    } else {
      // Auto-request from paymaster service
      const sponsorship = await requestPaymasterSponsorship(userOp);
      userOp.paymasterAndData = sponsorship.paymasterAndData;
    }

    // Sign and send UserOperation via bundler
    const result = await state.smartAccount.sendUserOperation(userOp);

    logger.info('Gasless USDT transfer sent', {
      to: recipientAddress,
      amount,
      userOpHash: result.userOpHash,
      bundler: AA_CONFIG.bundlerUrl
    });

    return {
      userOpHash: result.userOpHash,
      transactionHash: result.transactionHash || null, // Available after bundler includes it
      gasless: true,
      paymasterUsed: true
    };
  } catch (err) {
    logger.error('Gasless USDT transfer failed', {
      to: recipientAddress,
      amount,
      error: err.message
    });
    throw err;
  }
}

/**
 * Encode ERC20 transfer function call.
 * Function signature: transfer(address,uint256)
 */
function encodeERC20Transfer(recipient, amount) {
  const { ethers } = require('ethers');
  const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
  return iface.encodeFunctionData('transfer', [recipient, amount]);
}

/**
 * Request paymaster sponsorship for a UserOperation.
 * Calls the configured paymaster service API.
 */
async function requestPaymasterSponsorship(userOp) {
  if (!AA_CONFIG.paymasterUrl || AA_CONFIG.paymasterUrl.includes('example.com')) {
    throw new Error(
      'PAYMASTER_URL not configured. Set PAYMASTER_URL in .env to enable gasless transactions. ' +
      'Use a provider like Pimlico, Stackup, or Alchemy for paymaster services.'
    );
  }

  logger.debug('Requesting paymaster sponsorship', {
    sender: userOp.sender,
    paymaster: AA_CONFIG.paymasterUrl
  });

  try {
    // Call paymaster API to sponsor the UserOperation
    const axios = require('axios');
    const response = await axios.post(AA_CONFIG.paymasterUrl, {
      jsonrpc: '2.0',
      method: 'pm_sponsorUserOperation',
      params: [
        userOp,
        AA_CONFIG.entryPointAddress
      ],
      id: Date.now()
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.data.error) {
      throw new Error(`Paymaster error: ${response.data.error.message || JSON.stringify(response.data.error)}`);
    }

    const result = response.data.result;
    logger.info('Paymaster sponsorship received', {
      paymasterAndDataLength: result.paymasterAndData?.length || 0
    });

    return {
      paymasterAndData: result.paymasterAndData,
      preVerificationGas: BigInt(result.preVerificationGas || 21000),
      verificationGasLimit: BigInt(result.verificationGasLimit || 100000),
      callGasLimit: BigInt(result.callGasLimit || 50000)
    };
  } catch (err) {
    logger.error('Paymaster sponsorship request failed', { error: err.message });
    throw new Error(`Paymaster request failed: ${err.message}`);
  }
}

/**
 * Batch multiple operations into a single UserOperation.
 * This is more gas-efficient than multiple transactions.
 */
async function sendBatchOperations(operations) {
  if (!state.smartAccount) {
    throw new Error('ERC-4337 wallet not initialized');
  }

  try {
    // Create a batch UserOperation
    const userOp = await state.smartAccount.createBatchUserOperation(operations);

    // Request paymaster sponsorship
    const sponsorship = await requestPaymasterSponsorship(userOp);
    userOp.paymasterAndData = sponsorship.paymasterAndData;

    // Send via bundler
    const result = await state.smartAccount.sendUserOperation(userOp);

    logger.info('Batch operations sent', {
      operationCount: operations.length,
      userOpHash: result.userOpHash
    });

    return result;
  } catch (err) {
    logger.error('Batch operations failed', { error: err.message });
    throw err;
  }
}

/**
 * Get UserOperation status from bundler.
 */
async function getUserOperationStatus(userOpHash) {
  if (!state.smartAccount) {
    throw new Error('ERC-4337 wallet not initialized');
  }

  return state.smartAccount.getUserOperationReceipt(userOpHash);
}

/**
 * Estimate gas for a UserOperation.
 */
async function estimateUserOperationGas(userOp) {
  if (!state.smartAccount) {
    throw new Error('ERC-4337 wallet not initialized');
  }

  return state.smartAccount.estimateUserOperationGas(userOp);
}

/**
 * Clean up resources.
 */
function dispose() {
  if (state.wdk) {
    state.wdk.dispose();
    logger.info('ERC-4337 WDK disposed');
  }
}

// Export as singleton object
module.exports = {
  initialize,
  isAvailable,
  getSmartAccountAddress,
  sendGaslessUSDT,
  sendBatchOperations,
  getUserOperationStatus,
  estimateUserOperationGas,
  dispose,
  AA_CONFIG
};
