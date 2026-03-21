// ============================================
// SENTINEL — Loan Lifecycle Service
// ============================================
// Central business logic for the entire lending operation.
// Manages the full lifecycle:
//   Request → Score → Approve/Deny → Disburse → Repay/Default
//
// Every other module either feeds into or is called by this file.

const { v4: uuidv4 } = require('uuid');
const { Loan, Agent, Transaction } = require('../models');
const { calculateCreditScore } = require('../scoring/scoreEngine');
const walletManager = require('../wdk/walletManager');
const { getTierFromScore } = require('../utils/tierCalculator');
const { LOAN_STATUSES, SCORE_ADJUSTMENTS } = require('../utils/constants');
const config = require('../config');
const logger = require('../config/logger');

// =========================================================
// STEP 1: Request a loan
// =========================================================
// Agent submits: { did, amount, purpose }
// Sentinel validates, scores, and makes a decision.
async function requestLoan({ did, amount, purpose }) {
  // 1a. Verify agent exists and is eligible
  const agent = await Agent.findOne({ did });
  if (!agent) {
    const err = new Error('Agent not registered. Register first at POST /agents/register');
    err.statusCode = 404;
    throw err;
  }
  if (agent.isBlacklisted) {
    const err = new Error('Agent is blacklisted due to repeated defaults');
    err.statusCode = 403;
    throw err;
  }

  // 1b. Check for existing active loans (one loan at a time)
  const activeLoan = await Loan.findOne({
    borrowerDid: did,
    status: { $in: [LOAN_STATUSES.PENDING, LOAN_STATUSES.APPROVED, LOAN_STATUSES.DISBURSED] }
  });
  if (activeLoan) {
    const err = new Error(`Agent already has an active loan: ${activeLoan.loanId} (status: ${activeLoan.status})`);
    err.statusCode = 409;
    throw err;
  }

  // 1c. Create pending loan record
  const loan = new Loan({
    loanId: uuidv4(),
    borrowerDid: did,
    amount,
    purpose,
    status: LOAN_STATUSES.PENDING
  });
  await loan.save();

  logger.info('Loan requested', { loanId: loan.loanId, did, amount, purpose });

  // 1d. Run credit scoring
  const scoreResult = await calculateCreditScore(agent, { amount, purpose });

  // 1e. Apply the decision based on scoring
  return applyDecision(loan, agent, scoreResult);
}

// =========================================================
// STEP 2: Apply credit decision
// =========================================================
// Uses scoring result to approve or deny the loan.
async function applyDecision(loan, agent, scoreResult) {
  // Store scoring data on the loan record
  loan.mlScore = scoreResult.mlScore;
  loan.llmScore = scoreResult.llmScore;
  loan.combinedScore = scoreResult.combinedScore;
  loan.defaultProbability = scoreResult.defaultProbability;
  loan.decisionReasoning = scoreResult.reasoning;
  loan.tier = scoreResult.tier;
  loan.apr = scoreResult.apr;

  // DENIED: Tier D agents cannot borrow
  if (scoreResult.tier === 'D') {
    loan.status = LOAN_STATUSES.DENIED;
    await loan.save();

    logger.info('Loan denied — Tier D', { loanId: loan.loanId, score: scoreResult.combinedScore });
    return {
      loan: loan.toObject(),
      decision: 'denied',
      reason: `Credit score ${scoreResult.combinedScore} is below minimum threshold (Tier D)`
    };
  }

  // DENIED: Amount exceeds tier maximum
  if (loan.amount > scoreResult.maxLoan) {
    loan.status = LOAN_STATUSES.DENIED;
    await loan.save();

    logger.info('Loan denied — exceeds tier max', {
      loanId: loan.loanId,
      requested: loan.amount,
      tierMax: scoreResult.maxLoan,
      tier: scoreResult.tier
    });
    return {
      loan: loan.toObject(),
      decision: 'denied',
      reason: `Requested ${loan.amount} USDT exceeds Tier ${scoreResult.tier} maximum of ${scoreResult.maxLoan} USDT`
    };
  }

  // APPROVED: Calculate loan terms
  const durationDays = config.loan.defaultDurationDays;
  loan.collateralRequired = loan.amount * scoreResult.collateralPct;
  loan.dueDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  loan.interestAccrued = parseFloat((loan.amount * scoreResult.apr * (durationDays / 365)).toFixed(2));
  loan.totalDue = parseFloat((loan.amount + loan.interestAccrued).toFixed(2));
  loan.status = LOAN_STATUSES.APPROVED;
  await loan.save();

  // Update agent's credit score in the database
  agent.creditScore = scoreResult.combinedScore;
  agent.tier = scoreResult.tier;
  agent.lastActivity = new Date();
  await agent.save();

  logger.info('Loan approved', {
    loanId: loan.loanId,
    tier: scoreResult.tier,
    apr: scoreResult.apr,
    totalDue: loan.totalDue,
    dueDate: loan.dueDate
  });

  return {
    loan: loan.toObject(),
    decision: 'approved',
    terms: {
      tier: scoreResult.tier,
      apr: scoreResult.apr,
      amount: loan.amount,
      interestAccrued: loan.interestAccrued,
      totalDue: loan.totalDue,
      collateralRequired: loan.collateralRequired,
      dueDate: loan.dueDate,
      durationDays
    }
  };
}

// =========================================================
// STEP 3: Disburse approved loan on-chain
// =========================================================
// Sends USDT from Sentinel's wallet to the borrower via WDK.
async function disburseLoan(loanId) {
  const loan = await Loan.findOne({ loanId });
  if (!loan) {
    const err = new Error('Loan not found');
    err.statusCode = 404;
    throw err;
  }
  if (loan.status !== LOAN_STATUSES.APPROVED) {
    const err = new Error(`Loan is not in approved status (current: ${loan.status})`);
    err.statusCode = 400;
    throw err;
  }

  const agent = await Agent.findOne({ did: loan.borrowerDid });

  // Send USDT via WDK
  const { hash: txHash, fee } = await walletManager.sendUSDT(agent.walletAddress, loan.amount);

  // Record the on-chain transaction
  const tx = new Transaction({
    txHash,
    from: await walletManager.getSentinelAddress(),
    to: agent.walletAddress,
    amount: loan.amount,
    type: 'disbursement',
    loanId: loan.loanId,
    blockchain: config.wdk.blockchain,
    network: config.wdk.network,
    status: 'confirmed',
    fee,
    confirmedAt: new Date()
  });
  await tx.save();

  // Update loan status
  loan.status = LOAN_STATUSES.DISBURSED;
  loan.disbursementTxHash = txHash;
  loan.disbursedAt = new Date();
  await loan.save();

  // Update agent stats
  agent.totalLoans += 1;
  agent.lastActivity = new Date();
  await agent.save();

  logger.info('Loan disbursed', { loanId, txHash, amount: loan.amount });

  return {
    loan: loan.toObject(),
    txHash,
    fee
  };
}

// =========================================================
// STEP 4: Process repayment
// =========================================================
// Called when the borrower agent repays the loan.
async function processRepayment(loanId, repaymentTxHash) {
  const loan = await Loan.findOne({ loanId });
  if (!loan) {
    const err = new Error('Loan not found');
    err.statusCode = 404;
    throw err;
  }
  if (loan.status !== LOAN_STATUSES.DISBURSED) {
    const err = new Error(`Loan is not in disbursed status (current: ${loan.status})`);
    err.statusCode = 400;
    throw err;
  }

  const agent = await Agent.findOne({ did: loan.borrowerDid });

  // Record the repayment transaction
  const txHashToUse = repaymentTxHash || `0xREPAY_${Date.now().toString(16)}`;
  const tx = new Transaction({
    txHash: txHashToUse,
    from: agent.walletAddress,
    to: await walletManager.getSentinelAddress(),
    amount: loan.totalDue,
    type: 'repayment',
    loanId: loan.loanId,
    blockchain: config.wdk.blockchain,
    network: config.wdk.network,
    status: 'confirmed',
    confirmedAt: new Date()
  });
  await tx.save();

  // Update loan status
  loan.status = LOAN_STATUSES.REPAID;
  loan.repaymentTxHash = txHashToUse;
  loan.repaidAt = new Date();
  await loan.save();

  // Update agent credit profile
  const wasOnTime = new Date() <= loan.dueDate;
  agent.totalRepaid += 1;

  if (wasOnTime) {
    agent.creditScore = Math.min(100, agent.creditScore + SCORE_ADJUSTMENTS.ON_TIME_REPAYMENT);
  } else {
    agent.creditScore = Math.max(0, agent.creditScore + SCORE_ADJUSTMENTS.LATE_REPAYMENT);
  }

  agent.onTimeRate = agent.totalLoans > 0 ? agent.totalRepaid / agent.totalLoans : 0;
  agent.tier = getTierFromScore(agent.creditScore).tierLetter;
  agent.lastActivity = new Date();
  await agent.save();

  logger.info('Loan repaid', {
    loanId,
    onTime: wasOnTime,
    creditScoreChange: wasOnTime ? SCORE_ADJUSTMENTS.ON_TIME_REPAYMENT : SCORE_ADJUSTMENTS.LATE_REPAYMENT,
    newScore: agent.creditScore
  });

  return {
    loan: loan.toObject(),
    repaymentTxHash: txHashToUse,
    wasOnTime,
    creditScoreChange: wasOnTime ? SCORE_ADJUSTMENTS.ON_TIME_REPAYMENT : SCORE_ADJUSTMENTS.LATE_REPAYMENT,
    newCreditScore: agent.creditScore,
    newTier: agent.tier
  };
}

// =========================================================
// STEP 5: Mark loan as defaulted
// =========================================================
// Called by the repayment monitor when deadline passes.
async function markDefault(loanId) {
  const loan = await Loan.findOne({ loanId });
  if (!loan) {
    const err = new Error('Loan not found');
    err.statusCode = 404;
    throw err;
  }

  loan.status = LOAN_STATUSES.DEFAULTED;
  loan.defaultedAt = new Date();

  const agent = await Agent.findOne({ did: loan.borrowerDid });

  // ---- Collateral Liquidation ----
  // If the loan had collateral requirements, liquidate it
  let liquidationTxHash = null;
  if (loan.collateralRequired && loan.collateralRequired > 0) {
    try {
      logger.info('Liquidating collateral', {
        loanId,
        collateralAmount: loan.collateralRequired,
        borrowerWallet: agent.walletAddress
      });

      // Transfer collateral from borrower to Sentinel treasury
      // Note: In production, the collateral would already be locked in a smart contract
      // For this demo, we simulate the liquidation transfer
      const liquidationResult = await walletManager.sendUSDT(
        await walletManager.getSentinelAddress(),
        loan.collateralRequired
      );

      liquidationTxHash = liquidationResult.hash;

      // Record liquidation transaction
      const liquidationTx = new Transaction({
        txHash: liquidationTxHash,
        from: agent.walletAddress,
        to: await walletManager.getSentinelAddress(),
        amount: loan.collateralRequired,
        type: 'collateral_liquidation',
        loanId: loan.loanId,
        blockchain: config.wdk.blockchain,
        network: config.wdk.network,
        status: 'confirmed',
        confirmedAt: new Date()
      });
      await liquidationTx.save();

      loan.collateralLiquidated = true;
      loan.collateralLiquidationTxHash = liquidationTxHash;

      logger.info('Collateral liquidated successfully', {
        loanId,
        txHash: liquidationTxHash,
        amount: loan.collateralRequired
      });
    } catch (err) {
      logger.error('Collateral liquidation failed', {
        loanId,
        error: err.message
      });
      // Continue with default process even if liquidation fails
      loan.collateralLiquidated = false;
      loan.liquidationError = err.message;
    }
  }

  await loan.save();

  // Update agent credit profile
  agent.totalDefaulted += 1;
  agent.creditScore = Math.max(0, agent.creditScore + SCORE_ADJUSTMENTS.DEFAULT_PENALTY);
  agent.tier = getTierFromScore(agent.creditScore).tierLetter;
  agent.lastActivity = new Date();

  // Blacklist after too many defaults
  if (agent.totalDefaulted >= SCORE_ADJUSTMENTS.MAX_DEFAULTS_BEFORE_BAN) {
    agent.isBlacklisted = true;
    logger.warn('Agent blacklisted', { did: agent.did, totalDefaults: agent.totalDefaulted });
  }

  await agent.save();

  logger.info('Loan defaulted', {
    loanId,
    did: agent.did,
    newScore: agent.creditScore,
    blacklisted: agent.isBlacklisted,
    collateralLiquidated: loan.collateralLiquidated
  });

  return {
    loan: loan.toObject(),
    agent: {
      did: agent.did,
      creditScore: agent.creditScore,
      tier: agent.tier,
      isBlacklisted: agent.isBlacklisted
    },
    liquidation: liquidationTxHash ? {
      txHash: liquidationTxHash,
      amount: loan.collateralRequired
    } : null
  };
}

// =========================================================
// HELPER: Get loan status
// =========================================================
async function getLoanStatus(loanId) {
  const loan = await Loan.findOne({ loanId });
  if (!loan) return null;
  return loan.toObject();
}

// =========================================================
// HELPER: Get all loans for an agent
// =========================================================
async function getAgentLoans(did) {
  return Loan.find({ borrowerDid: did }).sort({ createdAt: -1 }).lean();
}

// Export as singleton object with all methods
module.exports = {
  requestLoan,
  applyDecision,
  disburseLoan,
  processRepayment,
  markDefault,
  getLoanStatus,
  getAgentLoans
};
