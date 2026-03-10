// ============================================
// SENTINEL — WDK Wallet Manager
// ============================================
// Singleton that wraps the Tether WDK SDK.
// Handles: wallet init, account creation, USDT transfers, balance checks.
//
// Architecture decision: This is a singleton because Sentinel has ONE
// master wallet (the lending pool). All operations go through this wallet.

const WDK = require('@tetherto/wdk').default || require('@tetherto/wdk');
const WalletManagerEvm = require('@tetherto/wdk-wallet-evm').default || require('@tetherto/wdk-wallet-evm');
const config = require('../config');
const logger = require('../config/logger');

// USDT contract addresses by network
const USDT_CONTRACTS = {
  mainnet: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  sepolia: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',  // Tether test USDT on Sepolia
  polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
};

// ============================================
// Internal state (closure for singleton pattern)
// ============================================
const state = {
  wdk: null,
  sentinelAccount: null,
  initialized: false
};

/**
 * Initialize the WDK with the seed phrase from config.
 * Must be called once at server startup before any wallet operations.
 */
async function initialize() {
  if (state.initialized) return;

  if (!config.wdk.seedPhrase) {
    logger.warn('WDK_SEED_PHRASE not set — wallet operations will be simulated');
    state.initialized = true;
    return;
  }

  try {
    // Build EVM wallet configuration
    const evmConfig = {};
    if (config.wdk.rpcUrl) {
      evmConfig.provider = config.wdk.rpcUrl;
    }

    // Create WDK instance with the seed phrase
    state.wdk = new WDK(config.wdk.seedPhrase)
      .registerWallet(config.wdk.blockchain, WalletManagerEvm, evmConfig);

    // Get Sentinel's master account (index 0)
    state.sentinelAccount = await state.wdk.getAccount(config.wdk.blockchain, 0);
    const address = await state.sentinelAccount.getAddress();

    logger.info('WDK initialized', {
      blockchain: config.wdk.blockchain,
      network: config.wdk.network,
      sentinelAddress: address
    });

    state.initialized = true;
  } catch (err) {
    logger.error('WDK initialization failed', { error: err.message });
    // Don't crash — allow server to start in simulation mode
    state.initialized = true;
  }
}

/**
 * Get Sentinel's master wallet address.
 */
async function getSentinelAddress() {
  if (!state.sentinelAccount) return 'SIMULATION_MODE';
  return state.sentinelAccount.getAddress();
}

/**
 * Create a new wallet account at the given index.
 * Each agent gets a unique index for their wallet.
 */
async function createWalletForAgent(index) {
  if (!state.wdk) {
    // Simulation mode — return a placeholder
    return {
      address: `0xSIM_${index.toString().padStart(40, '0')}`,
      index
    };
  }

  const account = await state.wdk.getAccount(config.wdk.blockchain, index);
  const address = await account.getAddress();

  logger.info('Wallet created for agent', { index, address });
  return { address, index };
}

/**
 * Send USDT to a recipient address.
 * This is the core on-chain operation for loan disbursement.
 */
async function sendUSDT(recipientAddress, amount) {
  const usdtContract = USDT_CONTRACTS[config.wdk.network] || USDT_CONTRACTS.sepolia;

  if (!state.sentinelAccount) {
    // Simulation mode
    const simHash = `0xSIM_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
    logger.info('SIMULATED USDT transfer', {
      to: recipientAddress,
      amount,
      txHash: simHash
    });
    return { hash: simHash, fee: '0' };
  }

  try {
    // Use the ERC20 transfer method from WDK
    // amount is in USDT (6 decimals), so 100 USDT = 100000000
    const amountInBaseUnits = BigInt(Math.round(amount * 1e6));

    const result = await state.sentinelAccount.transfer({
      token: usdtContract,
      recipient: recipientAddress,
      amount: amountInBaseUnits
    });

    logger.info('USDT transfer sent', {
      to: recipientAddress,
      amount,
      txHash: result.hash,
      fee: result.fee?.toString()
    });

    return {
      hash: result.hash,
      fee: result.fee?.toString() || '0'
    };
  } catch (err) {
    logger.error('USDT transfer failed', {
      to: recipientAddress,
      amount,
      error: err.message
    });
    throw err;
  }
}

/**
 * Check USDT balance for an address.
 */
async function getUSDTBalance(address) {
  const usdtContract = USDT_CONTRACTS[config.wdk.network] || USDT_CONTRACTS.sepolia;

  if (!state.sentinelAccount) {
    return { balance: 0, raw: '0' };
  }

  try {
    const { WalletAccountReadOnlyEvm } = require('@tetherto/wdk-wallet-evm');
    const readOnly = new WalletAccountReadOnlyEvm(address, {
      provider: config.wdk.rpcUrl
    });

    const rawBalance = await readOnly.getTokenBalance(usdtContract);
    const balance = Number(rawBalance) / 1e6; // USDT has 6 decimals

    return { balance, raw: rawBalance.toString() };
  } catch (err) {
    logger.error('Balance check failed', { address, error: err.message });
    return { balance: 0, raw: '0' };
  }
}

/**
 * Get Sentinel's native ETH balance (needed for gas).
 */
async function getSentinelETHBalance() {
  if (!state.sentinelAccount) {
    return { balance: 0, raw: '0' };
  }

  try {
    const rawBalance = await state.sentinelAccount.getBalance();
    const balance = Number(rawBalance) / 1e18; // ETH has 18 decimals
    return { balance, raw: rawBalance.toString() };
  } catch (err) {
    logger.error('ETH balance check failed', { error: err.message });
    return { balance: 0, raw: '0' };
  }
}

/**
 * Generate a random seed phrase (for demo/testing).
 */
function getRandomSeedPhrase() {
  return WDK.getRandomSeedPhrase();
}

/**
 * Validate a seed phrase.
 */
function isValidSeedPhrase(phrase) {
  return WDK.isValidSeedPhrase(phrase);
}

/**
 * Clean up resources.
 */
function dispose() {
  if (state.wdk) {
    state.wdk.dispose();
    logger.info('WDK disposed');
  }
}

// Export as singleton object with all methods
module.exports = {
  initialize,
  getSentinelAddress,
  createWalletForAgent,
  sendUSDT,
  getUSDTBalance,
  getSentinelETHBalance,
  getRandomSeedPhrase,
  isValidSeedPhrase,
  dispose
};
