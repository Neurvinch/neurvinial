// ============================================
// SENTINEL — WDK Wallet Manager (REAL IMPLEMENTATION)
// ============================================
// Singleton that wraps the Tether WDK SDK.
// Handles: wallet init, account creation, USDT transfers, balance checks.
// Supports ERC-4337 Account Abstraction (gasless transactions via Bundler + Paymaster)
//
// NO MOCKS - This file uses only real WDK operations.
// If WDK is not properly configured, operations will fail with clear errors.

const config = require('../config');
const logger = require('../config/logger');

// Lazy load WDK modules to handle import errors gracefully
let WDK, WalletManagerEvm, WalletAccountReadOnlyEvm;

try {
  WDK = require('@tetherto/wdk').default || require('@tetherto/wdk');
  const wdkEvm = require('@tetherto/wdk-wallet-evm');
  WalletManagerEvm = wdkEvm.default || wdkEvm;
  WalletAccountReadOnlyEvm = wdkEvm.WalletAccountReadOnlyEvm;
} catch (err) {
  logger.error('Failed to load WDK modules', { error: err.message });
}

// USDT contract addresses by network (REAL addresses)
const USDT_CONTRACTS = {
  mainnet: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  sepolia: '0xd077a400968890eacc75cdc901f0356c943e4fdb', // Tether USD on Sepolia (100 tokens available)
  polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
};

// Default RPC URLs (fallbacks)
const DEFAULT_RPC_URLS = {
  mainnet: 'https://eth.llamarpc.com',
  sepolia: 'https://rpc.sepolia.org',
  polygon: 'https://polygon-rpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc'
};

// ============================================
// Internal state (closure for singleton pattern)
// ============================================
const state = {
  wdk: null,
  sentinelAccount: null,
  initialized: false,
  seedPhrase: null,
  bundlerUrl: null,
  paymasterUrl: null,
  entryPointAddress: null,
  uses4337: false
};

/**
 * Generate a new random 12-word BIP-39 seed phrase using WDK.
 * This is a REAL seed phrase that can be used for production.
 */
function generateSeedPhrase(wordCount = 12) {
  if (!WDK) {
    throw new Error('WDK module not loaded. Run: npm install @tetherto/wdk @tetherto/wdk-wallet-evm');
  }
  return WDK.getRandomSeedPhrase(wordCount);
}

/**
 * Validate a seed phrase (basic BIP-39 format check).
 * Checks for 12 or 24 words separated by spaces.
 */
function validateSeedPhrase(phrase) {
  if (!phrase || typeof phrase !== 'string') {
    return false;
  }

  const words = phrase.trim().split(/\s+/);
  const wordCount = words.length;

  // BIP-39 supports 12, 15, 18, 21, or 24 word mnemonics
  // Most common are 12 and 24
  const validLengths = [12, 15, 18, 21, 24];

  if (!validLengths.includes(wordCount)) {
    return false;
  }

  // Check that each word is at least 3 characters (BIP-39 words are 3-8 chars)
  for (const word of words) {
    if (word.length < 3 || word.length > 8) {
      return false;
    }
  }

  return true;
}

/**
 * Initialize the WDK with the seed phrase from config.
 * Also initializes 4337 support if bundler/paymaster URLs are provided.
 * REQUIRED: WDK_SEED_PHRASE must be set in environment.
 * NO FALLBACK to simulation mode.
 */
async function initialize() {
  if (state.initialized) return;

  if (!WDK || !WalletManagerEvm) {
    throw new Error('WDK modules not loaded. Install with: npm install @tetherto/wdk @tetherto/wdk-wallet-evm');
  }

  const seedPhrase = config.wdk.seedPhrase;

  if (!seedPhrase) {
    // Generate a new seed phrase and log it (for first-time setup)
    const newSeed = generateSeedPhrase(12);
    logger.error('WDK_SEED_PHRASE not configured!');
    logger.info('Generated new seed phrase for you. Add this to your .env file:');
    logger.info(`WDK_SEED_PHRASE=${newSeed}`);
    throw new Error('WDK_SEED_PHRASE is required. Check logs for a generated seed phrase.');
  }

  // Validate seed phrase
  if (!validateSeedPhrase(seedPhrase)) {
    throw new Error('Invalid WDK_SEED_PHRASE. Must be a valid 12 or 24 word BIP-39 mnemonic.');
  }

  // Get RPC URL (use config or default)
  const rpcUrl = config.wdk.rpcUrl || DEFAULT_RPC_URLS[config.wdk.network] || DEFAULT_RPC_URLS.sepolia;

  try {
    // Build EVM wallet configuration
    const evmConfig = {
      provider: rpcUrl
    };

    // Add 4337 config if bundler/paymaster URLs are provided
    if (config.wdk.bundlerUrl && config.wdk.paymasterUrl) {
      evmConfig.bundlerUrl = config.wdk.bundlerUrl;
      evmConfig.paymasterUrl = config.wdk.paymasterUrl;
      evmConfig.entryPointAddress = config.wdk.entryPointAddress;
      state.uses4337 = true;
      state.bundlerUrl = config.wdk.bundlerUrl;
      state.paymasterUrl = config.wdk.paymasterUrl;
      state.entryPointAddress = config.wdk.entryPointAddress;
      logger.info('ERC-4337 Account Abstraction ENABLED', {
        bundler: config.wdk.bundlerUrl.substring(0, 40) + '...',
        paymaster: config.wdk.paymasterUrl.substring(0, 40) + '...',
        entryPoint: config.wdk.entryPointAddress
      });
    } else {
      logger.info('ERC-4337 Account Abstraction DISABLED (no bundler/paymaster URLs)');
    }

    // Create WDK instance with the seed phrase
    state.wdk = new WDK(seedPhrase)
      .registerWallet(config.wdk.blockchain, WalletManagerEvm, evmConfig);

    state.seedPhrase = seedPhrase;

    // Get Sentinel's master account (index 0)
    state.sentinelAccount = await state.wdk.getAccount(config.wdk.blockchain, 0);
    const address = await state.sentinelAccount.getAddress();

    // Verify we can connect by checking balance
    const ethBalance = await state.sentinelAccount.getBalance();

    logger.info('WDK initialized successfully', {
      blockchain: config.wdk.blockchain,
      network: config.wdk.network,
      rpcUrl: rpcUrl.substring(0, 30) + '...',
      sentinelAddress: address,
      ethBalance: (Number(ethBalance) / 1e18).toFixed(6) + ' ETH',
      accountAbstraction: state.uses4337 ? 'enabled' : 'disabled'
    });

    state.initialized = true;
  } catch (err) {
    logger.error('WDK initialization FAILED', { error: err.message });
    throw new Error(`WDK initialization failed: ${err.message}`);
  }
}

/**
 * Check if WDK is properly initialized.
 */
function isInitialized() {
  return state.initialized && state.sentinelAccount !== null;
}

/**
 * Check if 4337 Account Abstraction is enabled (bundler + paymaster configured).
 */
function is4337Enabled() {
  return state.uses4337 && state.bundlerUrl && state.paymasterUrl;
}

/**
 * Require initialization - throws if not initialized.
 */
function requireInitialized() {
  if (!isInitialized()) {
    throw new Error('WDK not initialized. Call initialize() first or check WDK_SEED_PHRASE configuration.');
  }
}

/**
 * Get Sentinel's master wallet address.
 */
async function getSentinelAddress() {
  requireInitialized();
  return state.sentinelAccount.getAddress();
}

/**
 * Create a new wallet account at the given index.
 * Each agent gets a unique index for their wallet.
 */
async function createWalletForAgent(index) {
  requireInitialized();

  const account = await state.wdk.getAccount(config.wdk.blockchain, index);
  const address = await account.getAddress();

  logger.info('Wallet created for agent', { index, address });
  return { address, index };
}

/**
 * Send USDT to a recipient address.
 * This is the core on-chain operation for loan disbursement.
 *
 * MODE 1 - Traditional (if no 4337):
 *   User has ETH → Signs tx → Pays gas → Receives USDT
 *
 * MODE 2 - 4337 Account Abstraction (if bundler + paymaster configured):
 *   User has NO ETH → Signs UserOperation → Bundler submits → Paymaster pays gas → Receives USDT
 *
 * REAL TRANSACTION - requires either ETH (traditional) or Paymaster sponsorship (4337)
 */
async function sendUSDT(recipientAddress, amount) {
  requireInitialized();

  const usdtContract = USDT_CONTRACTS[config.wdk.network] || USDT_CONTRACTS.sepolia;
  const amountInBaseUnits = BigInt(Math.round(amount * 1e6)); // USDT has 6 decimals
  const tokenSymbol = config.wdk.network === 'sepolia' ? 'USDT' : 'USDT'; // Could be USDC on some testnets

  const is4337Active = is4337Enabled();

  logger.info('Initiating USDT transfer', {
    to: recipientAddress,
    amount,
    amountBaseUnits: amountInBaseUnits.toString(),
    token: usdtContract,
    network: config.wdk.network,
    transferMode: is4337Active ? '4337-abstracted' : 'traditional',
    bundlerUrl: is4337Active ? config.wdk.bundlerUrl.substring(0, 40) + '...' : 'N/A',
    paymasterUrl: is4337Active ? config.wdk.paymasterUrl.substring(0, 40) + '...' : 'N/A'
  });

  try {
    // Check if we have sufficient USDT balance first
    const treasuryBalance = await getSentinelUSDTBalance();

    if (treasuryBalance.balance < amount) {
      // REAL ERROR - Treasury needs funding
      const errorMsg = `Treasury insufficient ${tokenSymbol}: need ${amount} ${tokenSymbol} but only have ${treasuryBalance.balance.toFixed(2)} ${tokenSymbol}. Fund the treasury wallet to enable real transfers.`;
      logger.error('Transfer BLOCKED - Treasury needs funding', {
        needed: amount,
        available: treasuryBalance.balance,
        tokenSymbol,
        network: config.wdk.network,
        treasuryAddress: await getSentinelAddress()
      });
      throw new Error(errorMsg);
    }

    // Real transfer for mainnet or when treasury has sufficient balance
    const result = await state.sentinelAccount.transfer({
      token: usdtContract,
      recipient: recipientAddress,
      amount: amountInBaseUnits
    });

    logger.info('Stablecoin transfer CONFIRMED', {
      to: recipientAddress,
      amount,
      tokenSymbol,
      txHash: result.hash,
      fee: result.fee?.toString(),
      transferMode: is4337Active ? '4337-abstracted' : 'traditional',
      gasSponsored: is4337Active ? 'paymaster' : 'sender'
    });

    return {
      hash: result.hash,
      fee: result.fee?.toString() || '0',
      mode: is4337Active ? '4337' : 'traditional',
      simulated: false
    };
  } catch (err) {
    logger.error('Stablecoin transfer FAILED', {
      to: recipientAddress,
      amount,
      tokenSymbol,
      error: err.message,
      transferMode: is4337Active ? '4337-abstracted' : 'traditional'
    });
    throw new Error(`${tokenSymbol} transfer failed: ${err.message}`);
  }
}

/**
 * Send USDT from an agent's wallet to a recipient.
 * This allows agents to repay loans from their own wallets.
 *
 * @param {number} agentWalletIndex - The agent's wallet derivation index
 * @param {string} recipientAddress - Recipient wallet address
 * @param {number} amount - Amount in USDT (e.g., 10.5 = $10.50)
 * @returns {Promise<{hash: string, fee: string, mode: string, from: string}>} Transaction result
 */
async function sendUSDTFromAgent(agentWalletIndex, recipientAddress, amount) {
  requireInitialized();

  const usdtContract = USDT_CONTRACTS[config.wdk.network] || USDT_CONTRACTS.sepolia;
  const amountInBaseUnits = BigInt(Math.round(amount * 1e6)); // USDT has 6 decimals
  const tokenSymbol = 'USDT';
  const is4337Active = is4337Enabled();

  logger.info('Initiating agent USDT transfer', {
    agentIndex: agentWalletIndex,
    to: recipientAddress,
    amount,
    amountBaseUnits: amountInBaseUnits.toString(),
    token: usdtContract,
    network: config.wdk.network,
    transferMode: is4337Active ? '4337-abstracted' : 'traditional'
  });

  try {
    // Get the agent's account by index
    const agentAccount = await state.wdk.getAccount(config.wdk.blockchain, agentWalletIndex);
    const agentAddress = await agentAccount.getAddress();

    // Check agent's USDT balance
    const agentBalance = await getUSDTBalance(agentAddress);

    if (agentBalance.balance < amount) {
      const errorMsg = `Agent wallet insufficient ${tokenSymbol}: need ${amount} ${tokenSymbol} but only have ${agentBalance.balance.toFixed(2)} ${tokenSymbol}.`;
      logger.error('Agent transfer BLOCKED - insufficient balance', {
        agentIndex: agentWalletIndex,
        agentAddress,
        needed: amount,
        available: agentBalance.balance,
        tokenSymbol
      });
      throw new Error(errorMsg);
    }

    // Execute the transfer from agent's wallet
    const result = await agentAccount.transfer({
      token: usdtContract,
      recipient: recipientAddress,
      amount: amountInBaseUnits
    });

    logger.info('Agent stablecoin transfer CONFIRMED', {
      from: agentAddress,
      to: recipientAddress,
      amount,
      tokenSymbol,
      txHash: result.hash,
      fee: result.fee?.toString(),
      transferMode: is4337Active ? '4337-abstracted' : 'traditional',
      gasSponsored: is4337Active ? 'paymaster' : 'sender'
    });

    return {
      hash: result.hash,
      fee: result.fee?.toString() || '0',
      mode: is4337Active ? '4337' : 'traditional',
      simulated: false,
      from: agentAddress
    };
  } catch (err) {
    logger.error('Agent stablecoin transfer FAILED', {
      agentIndex: agentWalletIndex,
      to: recipientAddress,
      amount,
      tokenSymbol,
      error: err.message,
      transferMode: is4337Active ? '4337-abstracted' : 'traditional'
    });
    throw new Error(`${tokenSymbol} transfer failed: ${err.message}`);
  }
}

/**
 * Check stablecoin balance for any address.
 * Returns USDT on mainnet/polygon/arbitrum, USDC on Sepolia.
 */
async function getUSDTBalance(address) {
  requireInitialized();

  const usdtContract = USDT_CONTRACTS[config.wdk.network] || USDT_CONTRACTS.sepolia;
  const rpcUrl = config.wdk.rpcUrl || DEFAULT_RPC_URLS[config.wdk.network] || DEFAULT_RPC_URLS.sepolia;

  try {
    const readOnly = new WalletAccountReadOnlyEvm(address, {
      provider: rpcUrl
    });

    const rawBalance = await readOnly.getTokenBalance(usdtContract);
    const balance = Number(rawBalance) / 1e6; // USDT/USDC both have 6 decimals

    return { balance, raw: rawBalance.toString() };
  } catch (err) {
    logger.error('Balance check failed', { address, error: err.message });
    throw new Error(`Balance check failed: ${err.message}`);
  }
}

/**
 * Get Sentinel's native ETH balance (needed for gas).
 */
async function getSentinelETHBalance() {
  requireInitialized();

  try {
    const rawBalance = await state.sentinelAccount.getBalance();
    const balance = Number(rawBalance) / 1e18; // ETH has 18 decimals
    return { balance, raw: rawBalance.toString() };
  } catch (err) {
    logger.error('ETH balance check failed', { error: err.message });
    throw new Error(`ETH balance check failed: ${err.message}`);
  }
}

/**
 * Get Sentinel's stablecoin balance (USDT on mainnet, USDC on Sepolia).
 */
async function getSentinelUSDTBalance() {
  requireInitialized();
  const address = await getSentinelAddress();
  return getUSDTBalance(address);
}

/**
 * Get transaction receipt by hash.
 */
async function getTransactionReceipt(txHash) {
  requireInitialized();

  try {
    return await state.sentinelAccount.getTransactionReceipt(txHash);
  } catch (err) {
    logger.error('Failed to get transaction receipt', { txHash, error: err.message });
    throw err;
  }
}

/**
 * Sign a message with Sentinel's wallet.
 */
async function signMessage(message) {
  requireInitialized();
  return state.sentinelAccount.sign(message);
}

/**
 * Verify a signed message.
 */
async function verifyMessage(message, signature) {
  requireInitialized();
  return state.sentinelAccount.verify(message, signature);
}

/**
 * Get fee rates from the network.
 */
async function getFeeRates() {
  requireInitialized();

  try {
    return await state.wdk.getFeeRates(config.wdk.blockchain);
  } catch (err) {
    logger.error('Failed to get fee rates', { error: err.message });
    return { normal: BigInt(0), fast: BigInt(0) };
  }
}

/**
 * Clean up resources.
 */
function dispose() {
  if (state.wdk) {
    state.wdk.dispose();
    state.wdk = null;
    state.sentinelAccount = null;
    state.initialized = false;
    logger.info('WDK disposed');
  }
}

// Export USDT contracts for external use
module.exports = {
  // Core operations
  initialize,
  isInitialized,
  is4337Enabled,
  getSentinelAddress,
  createWalletForAgent,
  sendUSDT,
  sendUSDTFromAgent,
  getUSDTBalance,
  getSentinelETHBalance,
  getSentinelUSDTBalance,
  getTransactionReceipt,

  // Signing
  signMessage,
  verifyMessage,

  // Utilities
  generateSeedPhrase,
  validateSeedPhrase,
  getFeeRates,
  dispose,

  // Constants
  USDT_CONTRACTS,
  DEFAULT_RPC_URLS
};
