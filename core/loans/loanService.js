// ============================================
// SENTINEL — Loan Lifecycle Service
// ============================================
// Central business logic for the entire lending operation.
// Manages the full lifecycle:
//   Request → Score → Approve/Deny → Disburse → Repay/Default
//
// Every other module either feeds into or is called by this file.
// Integrates LP Agent Manager for capital sourcing (FR-CP-02).

const { v4: uuidv4 } = require('uuid');
const { Loan, Agent, Transaction } = require('../models');
const { calculateCreditScore } = require('../scoring/scoreEngine');
const walletManager = require('../wdk/walletManager');
const lpAgentManager = require('../capital/lpAgentManager');
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
// If treasury is low, requests capital from LP agents (FR-CP-02).
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

  // Check treasury balance
  let lpCapitalUsed = null;
  try {
    const treasuryBalance = await walletManager.getSentinelUSDTBalance();

    // If treasury is low, request capital from LP agents
    if (treasuryBalance.balance < loan.amount) {
      logger.info('Treasury low - requesting capital from LP pool', {
        needed: loan.amount,
        treasuryBalance: treasuryBalance.balance
      });

      const lpRequest = await lpAgentManager.requestCapitalFromLP(loan.amount);

      if (lpRequest.success) {
        // Store LP agent info on loan for repayment tracking
        loan.lpAgentId = lpRequest.lpAgentId;
        loan.lpApr = lpRequest.apr;
        lpCapitalUsed = {
          lpAgentId: lpRequest.lpAgentId,
          amount: lpRequest.amount,
          apr: lpRequest.apr
        };
        logger.info('LP capital secured for loan', lpCapitalUsed);
      } else {
        logger.warn('LP capital request failed', { reason: lpRequest.reason });
        // Continue anyway - sendUSDT will throw if truly insufficient
      }
    }
  } catch (balanceErr) {
    logger.warn('Could not check treasury balance', { error: balanceErr.message });
  }

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

  logger.info('Loan disbursed', { loanId, txHash, amount: loan.amount, lpCapitalUsed });

  return {
    loan: loan.toObject(),
    txHash,
    fee,
    lpCapitalUsed
  };
}

// =========================================================
// STEP 4: Process repayment
// =========================================================
// Called when the borrower agent repays the loan.
// If loan was funded by LP agent, repays them with interest.
// Now includes ON-CHAIN VERIFICATION via WDK Indexer API!
async function processRepayment(loanId, repaymentTxHash, options = {}) {
  const { skipVerification = false } = options;

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
  const treasuryAddress = await walletManager.getSentinelAddress();

  // =========================================================
  // CRITICAL: Block if same TX as disbursement
  // =========================================================
  if (repaymentTxHash && loan.disbursementTxHash) {
    if (repaymentTxHash.toLowerCase() === loan.disbursementTxHash.toLowerCase()) {
      const err = new Error('Invalid TX: This is the disbursement transaction, not a repayment. You must send USDT TO the treasury, not use the TX where we sent to you.');
      err.statusCode = 400;
      throw err;
    }
  }

  // =========================================================
  // ON-CHAIN VERIFICATION (REQUIRED if TX hash provided)
  // =========================================================
  let verificationResult = null;
  if (repaymentTxHash && repaymentTxHash.startsWith('0x') && !skipVerification) {
    try {
      const indexerService = require('../wdk/indexerService');

      // Verify the transaction on-chain - MUST be FROM borrower TO treasury
      verificationResult = await indexerService.verifyTransaction(repaymentTxHash, {
        from: agent.walletAddress,  // CRITICAL: Must be from borrower
        to: treasuryAddress,         // CRITICAL: Must be to treasury
        minAmount: loan.totalDue * 0.95 // Allow 5% tolerance for gas/fees
      });

      logger.info('On-chain TX verification', {
        loanId,
        txHash: repaymentTxHash,
        verified: verificationResult.verified,
        reason: verificationResult.reason
      });

      // BLOCK if verification failed
      if (!verificationResult.verified) {
        const err = new Error(`TX verification failed: ${verificationResult.reason}. Make sure you sent USDT FROM your wallet (${agent.walletAddress}) TO the treasury (${treasuryAddress}).`);
        err.statusCode = 400;
        err.verificationResult = verificationResult;
        throw err;
      }
    } catch (verifyErr) {
      // If it's our verification error, rethrow it
      if (verifyErr.statusCode === 400) {
        throw verifyErr;
      }

      // For indexer API errors (404, network issues), provide guidance
      logger.warn('TX verification unavailable', { error: verifyErr.message });
      const err = new Error(`Cannot verify TX on-chain: ${verifyErr.message}. Please ensure the TX is confirmed on Etherscan and try again in a few minutes.`);
      err.statusCode = 503;
      throw err;
    }
  } else if (skipVerification) {
    // Daemon/internal call with skipVerification - allow without full verification
    logger.info('Repayment processing with skipVerification', { loanId, txHash: repaymentTxHash || 'auto-detected' });
  } else if (!repaymentTxHash || !repaymentTxHash.startsWith('0x')) {
    // No valid TX hash provided by user
    const err = new Error('Valid transaction hash required. Send USDT to the treasury and provide the TX hash from Etherscan.');
    err.statusCode = 400;
    throw err;
  }

  // Record the repayment transaction
  const txHashToRecord = repaymentTxHash || `0xAUTO_${Date.now().toString(16)}`;
  const tx = new Transaction({
    txHash: txHashToRecord,
    from: agent.walletAddress,
    to: treasuryAddress,
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
  loan.repaymentTxHash = txHashToRecord;
  loan.repaidAt = new Date();
  await loan.save();

  // If loan was funded by LP agent, repay them
  let lpRepayment = null;
  if (loan.lpAgentId) {
    try {
      lpRepayment = await lpAgentManager.repayLPAgent(
        loan.lpAgentId,
        loan.amount,
        loan.interestAccrued || 0
      );
      logger.info('LP agent repaid', {
        lpAgentId: loan.lpAgentId,
        principalReturned: loan.amount,
        lpInterestPaid: lpRepayment?.lpInterestPaid
      });
    } catch (lpErr) {
      logger.error('LP repayment failed (non-blocking)', { error: lpErr.message });
    }
  }

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
    newScore: agent.creditScore,
    lpRepayment: lpRepayment ? 'completed' : 'not_applicable'
  });

  return {
    loan: loan.toObject(),
    repaymentTxHash: txHashToUse,
    wasOnTime,
    creditScoreChange: wasOnTime ? SCORE_ADJUSTMENTS.ON_TIME_REPAYMENT : SCORE_ADJUSTMENTS.LATE_REPAYMENT,
    newCreditScore: agent.creditScore,
    newTier: agent.tier,
    lpRepayment
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

// =========================================================
// HELPER: Mark loan as repaid (alias for processRepayment)
// =========================================================
// Used by the repayment monitor daemon for autonomous detection.
// Daemon already verified the TX via indexer, so skip double verification.
async function markRepaid(loanId, repaymentTxHash = null) {
  return processRepayment(loanId, repaymentTxHash, { skipVerification: true });
}

// Export as singleton object with all methods
module.exports = {
  requestLoan,
  applyDecision,
  disburseLoan,
  processRepayment,
  markDefault,
  markRepaid, // Alias for daemon compatibility
  getLoanStatus,
  getAgentLoans
};
