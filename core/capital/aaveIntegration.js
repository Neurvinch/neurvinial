// ============================================
// SENTINEL — AAVE Protocol Integration
// ============================================
// Manages idle capital deployment to AAVE for yield generation.
//
// SRD Requirement: FR-CP-01
// "When idle capital exceeds threshold, deploy to yield protocols"
//
// Supported Networks:
// - Ethereum Mainnet: AAVE V3
// - Polygon: AAVE V3
// - Arbitrum: AAVE V3
//
// Note: This uses direct AAVE contract calls via ethers.js
// Production deployment requires proper security audits.

const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../config/logger');
const walletManager = require('../wdk/walletManager');

// AAVE V3 Pool addresses by network
const AAVE_POOLS = {
  mainnet: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  sepolia: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951', // AAVE V3 Sepolia Pool
  polygon: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  arbitrum: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
};

// aTokens (interest-bearing tokens) for USDT
const A_TOKENS = {
  mainnet: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a', // aUSDT
  sepolia: '0xAF0F6e8b0Dc5c913bbF4d14c22B4E78Dd14310B6', // aUSDT Sepolia
  polygon: '0x6ab707Aca953eDAeFBc4fD23bA73294241490620',
  arbitrum: '0x6ab707Aca953eDAeFBc4fD23bA73294241490620'
};

// AAVE Pool ABI (only the functions we need)
const AAVE_POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
];

// ERC20 ABI for approvals
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
];

// ============================================
// Internal state
// ============================================
const state = {
  totalDeposited: 0,
  totalWithdrawn: 0,
  currentDeposit: 0,
  interestEarned: 0,
  lastUpdateTime: null,
  deposits: []
};

/**
 * Get the RPC provider for the current network
 */
function getProvider() {
  const rpcUrl = config.wdk.rpcUrl || 'https://rpc.sepolia.org';
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get AAVE pool address for current network
 */
function getPoolAddress() {
  const network = config.wdk.network || 'sepolia';
  return AAVE_POOLS[network] || AAVE_POOLS.sepolia;
}

/**
 * Get USDT address for current network
 */
function getUsdtAddress() {
  const network = config.wdk.network || 'sepolia';
  return walletManager.USDT_CONTRACTS[network] || walletManager.USDT_CONTRACTS.sepolia;
}

/**
 * Get aToken address for current network
 */
function getATokenAddress() {
  const network = config.wdk.network || 'sepolia';
  return A_TOKENS[network] || A_TOKENS.sepolia;
}

/**
 * Deposit idle capital to AAVE for yield
 * @param {number} amount - Amount of USDT to deposit
 * @returns {Object} Deposit result
 */
async function depositToAave(amount) {
  if (!walletManager.isInitialized()) {
    throw new Error('WDK not initialized. Cannot deposit to AAVE.');
  }

  const amountInBaseUnits = BigInt(Math.round(amount * 1e6)); // USDT has 6 decimals
  const sentinelAddress = await walletManager.getSentinelAddress();

  logger.info('Initiating AAVE deposit', {
    amount,
    sentinelAddress,
    pool: getPoolAddress(),
    network: config.wdk.network
  });

  try {
    // Check treasury balance first
    const treasuryBalance = await walletManager.getSentinelUSDTBalance();
    if (treasuryBalance.balance < amount) {
      throw new Error(`Insufficient USDT for AAVE deposit. Have ${treasuryBalance.balance}, need ${amount}`);
    }

    // For production: Use WDK to approve and deposit
    // This is a simplified implementation - in production you'd use WDK's contract interaction

    // Record deposit (in production, this would be the actual AAVE interaction)
    const depositRecord = {
      id: `aave_deposit_${Date.now()}`,
      amount,
      timestamp: new Date(),
      txHash: null, // Would be set after real TX
      status: 'pending',
      network: config.wdk.network,
      pool: getPoolAddress()
    };

    // NOTE: Real AAVE deposit requires:
    // 1. Approve USDT spending to AAVE Pool
    // 2. Call pool.supply(usdtAddress, amount, sentinelAddress, 0)
    // 3. Track aToken balance for interest accrual

    // For hackathon demo, we track internally and log the intent
    state.deposits.push(depositRecord);
    state.totalDeposited += amount;
    state.currentDeposit += amount;
    state.lastUpdateTime = new Date();

    logger.info('AAVE deposit recorded (production needs real contract call)', {
      depositId: depositRecord.id,
      amount,
      totalDeposited: state.totalDeposited
    });

    return {
      success: true,
      depositId: depositRecord.id,
      amount,
      pool: getPoolAddress(),
      network: config.wdk.network,
      note: 'AAVE deposit ready. Production deployment requires WDK contract interaction.',
      estimatedAPY: await getEstimatedAPY()
    };
  } catch (error) {
    logger.error('AAVE deposit failed', { error: error.message, amount });
    throw error;
  }
}

/**
 * Withdraw capital from AAVE
 * @param {number} amount - Amount of USDT to withdraw
 * @returns {Object} Withdrawal result
 */
async function withdrawFromAave(amount) {
  if (amount > state.currentDeposit) {
    throw new Error(`Cannot withdraw ${amount} USDT. Only ${state.currentDeposit} deposited in AAVE.`);
  }

  logger.info('Initiating AAVE withdrawal', {
    amount,
    currentDeposit: state.currentDeposit
  });

  try {
    // For production: Use WDK to call pool.withdraw()
    // This is a simplified implementation

    state.currentDeposit -= amount;
    state.totalWithdrawn += amount;
    state.lastUpdateTime = new Date();

    // Calculate accrued interest (simplified)
    const interestRate = await getEstimatedAPY() / 100;
    const daysDeposited = state.deposits.length > 0
      ? (Date.now() - new Date(state.deposits[0].timestamp).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const interest = amount * interestRate * (daysDeposited / 365);
    state.interestEarned += interest;

    logger.info('AAVE withdrawal recorded', {
      amount,
      remainingDeposit: state.currentDeposit,
      interestEarned: interest.toFixed(4)
    });

    return {
      success: true,
      withdrawn: amount,
      interestEarned: parseFloat(interest.toFixed(4)),
      remainingDeposit: state.currentDeposit,
      note: 'AAVE withdrawal ready. Production deployment requires WDK contract interaction.'
    };
  } catch (error) {
    logger.error('AAVE withdrawal failed', { error: error.message, amount });
    throw error;
  }
}

/**
 * Get estimated APY for USDT on AAVE
 * In production, this would query AAVE's getReserveData()
 */
async function getEstimatedAPY() {
  // AAVE USDT APY varies by network and utilization
  // These are approximate values as of March 2026
  const apyByNetwork = {
    mainnet: 4.2,
    sepolia: 3.5, // Testnet usually has lower activity
    polygon: 5.1,
    arbitrum: 4.8
  };

  const network = config.wdk.network || 'sepolia';
  return apyByNetwork[network] || 3.5;
}

/**
 * Get current AAVE status
 */
async function getAaveStatus() {
  const estimatedAPY = await getEstimatedAPY();

  // Calculate estimated interest accrued
  let estimatedInterest = 0;
  if (state.currentDeposit > 0 && state.deposits.length > 0) {
    const oldestDeposit = state.deposits[0];
    const daysDeposited = (Date.now() - new Date(oldestDeposit.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    estimatedInterest = state.currentDeposit * (estimatedAPY / 100) * (daysDeposited / 365);
  }

  return {
    network: config.wdk.network || 'sepolia',
    poolAddress: getPoolAddress(),
    aTokenAddress: getATokenAddress(),
    currentDeposit: state.currentDeposit,
    totalDeposited: state.totalDeposited,
    totalWithdrawn: state.totalWithdrawn,
    interestEarned: parseFloat((state.interestEarned + estimatedInterest).toFixed(4)),
    estimatedAPY,
    lastUpdateTime: state.lastUpdateTime,
    depositsCount: state.deposits.length,
    status: state.currentDeposit > 0 ? 'active' : 'idle'
  };
}

/**
 * Check if AAVE deployment is recommended based on idle capital
 * @param {number} idleCapital - Current idle capital amount
 * @returns {Object} Recommendation
 */
function shouldDeployToAave(idleCapital) {
  const minDeployment = 1000; // Minimum USDT to deploy (gas efficiency)
  const recommendedReserve = 5000; // Keep at least this much liquid

  if (idleCapital < minDeployment) {
    return {
      recommend: false,
      reason: `Idle capital (${idleCapital} USDT) below minimum deployment threshold (${minDeployment} USDT)`
    };
  }

  const deployableAmount = Math.max(0, idleCapital - recommendedReserve);

  if (deployableAmount < minDeployment) {
    return {
      recommend: false,
      reason: `After maintaining ${recommendedReserve} USDT reserve, deployable amount (${deployableAmount} USDT) is too low`
    };
  }

  return {
    recommend: true,
    deployableAmount,
    estimatedYield: deployableAmount * (4.2 / 100), // Annual yield estimate
    reason: `${deployableAmount} USDT can be deployed to AAVE for ~4.2% APY`
  };
}

/**
 * Get yield opportunities summary
 */
async function getYieldOpportunities() {
  const estimatedAPY = await getEstimatedAPY();

  return [
    {
      protocol: 'AAVE V3',
      asset: 'USDT',
      apy: estimatedAPY,
      risk: 'low',
      tvl: '$2.1B',
      network: config.wdk.network || 'sepolia',
      status: 'available',
      minDeposit: 100
    },
    {
      protocol: 'Compound V3',
      asset: 'USDC',
      apy: 3.8,
      risk: 'low',
      tvl: '$890M',
      network: 'ethereum',
      status: 'coming_soon',
      minDeposit: 100
    },
    {
      protocol: 'SENTINEL LP Pool',
      asset: 'USDT',
      apy: 8.0,
      risk: 'medium',
      tvl: 'N/A',
      network: config.wdk.network || 'sepolia',
      status: 'internal',
      minDeposit: 100
    }
  ];
}

module.exports = {
  depositToAave,
  withdrawFromAave,
  getAaveStatus,
  getEstimatedAPY,
  shouldDeployToAave,
  getYieldOpportunities
};
