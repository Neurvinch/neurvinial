// ============================================
// SENTINEL — Loan API Routes
// ============================================
// POST /loans/request      — Submit a loan request
// GET  /loans/:id/status   — Poll loan status
// POST  /loans/:id/disburse — Disburse an approved loan
// POST /loans/:id/repay    — Process repayment

const express  = require('express');
const mongoose = require('mongoose');
const validateRequest = require('../middleware/validateRequest');
const { requireApiKey } = require('../middleware/apiAuth');
const {
  loanRequestSchema,
  loanRepaymentSchema
} = require('../middleware/schemas');
const loanService     = require('../loans/loanService');
const demo            = require('../demo/demoStore');
const { RISK_TIERS }  = require('../utils/constants');
const logger          = require('../config/logger');

const router = express.Router();

function dbReady() { return mongoose.connection.readyState === 1; }

// ---- POST /loans/request ----(protected) ----
router.post('/request', requireApiKey, validateRequest(loanRequestSchema), async (req, res, next) => {
  try {
    const { did, amount, purpose } = req.body;

    // ── Live MongoDB path ──────────────────────────────────────
    if (dbReady()) {
      const result     = await loanService.requestLoan({ did, amount, purpose });
      const statusCode = result.decision === 'approved' ? 201 : 200;
      return res.status(statusCode).json({
        success: true,
        data: {
          decision: result.decision,
          loanId:   result.loan.loanId,
          reason:   result.reason,
          terms:    result.terms,
          scoring: {
            mlScore:           result.loan.mlScore,
            llmScore:          result.loan.llmScore,
            combinedScore:     result.loan.combinedScore,
            defaultProbability:result.loan.defaultProbability,
            tier:              result.loan.tier,
            reasoning:         result.loan.decisionReasoning,
          }
        }
      });
    }

    // ── In-memory store path ──────────────────────────────────
    // Used when MongoDB is not connected. Still uses real WDK for on-chain operations.
    // 1. Find agent in store
    const agent = demo.findAgentByDid(did);
    if (!agent) {
      return res.status(404).json({ error: { message: 'Agent not found. Register first at POST /agents/register', code: 'AGENT_NOT_FOUND' } });
    }
    if (agent.isBlacklisted) {
      return res.status(403).json({ error: { message: 'Agent is blacklisted', code: 'BLACKLISTED' } });
    }

    // 2. Use agent's stored creditScore to determine tier (avoids ML scoring 0-history as Tier D)
    //    Full ML+LLM scoring only kicks in once the agent has real loan history.
    const { getTierFromScore } = require('../utils/tierCalculator');
    const tierObj     = getTierFromScore(agent.creditScore);
    const tier        = tierObj.tierLetter;
    const tierConfig  = RISK_TIERS[tier];
    const scoreResult = {
      mlScore:           agent.creditScore,
      llmScore:          agent.creditScore,
      combinedScore:     agent.creditScore,
      defaultProbability:1 - agent.creditScore / 100,
      reasoning:         `Demo mode: credit score ${agent.creditScore} → Tier ${tier}`,
    };

    // 3. Enforce tier limits
    if (tier === 'D') {
      return res.status(200).json({
        success: true,
        data: {
          decision: 'denied',
          reason:   'Tier D — credit score too low for lending.',
          scoring:  { combinedScore: scoreResult.combinedScore, tier, reasoning: scoreResult.reasoning },
        }
      });
    }
    if (amount > tierConfig.maxLoan) {
      return res.status(200).json({
        success: true,
        data: {
          decision: 'denied',
          reason:   `Amount ${amount} USDT exceeds Tier ${tier} limit of ${tierConfig.maxLoan} USDT.`,
          scoring:  { combinedScore: scoreResult.combinedScore, tier },
        }
      });
    }

    // 4. Create loan in demo store
    const loan = demo.createLoan({
      borrowerDid:        did,
      amount,
      purpose:            purpose || 'general',
      mlScore:            scoreResult.mlScore,
      llmScore:           scoreResult.llmScore,
      combinedScore:      scoreResult.combinedScore,
      defaultProbability: scoreResult.defaultProbability,
      tier,
      apr:                tierConfig.apr * 100,  // store as percent (e.g. 4, not 0.04)
      collateral:         Math.round(amount * (tierConfig.collateralPct || 0)),
      durationDays:       30,
      decisionReasoning:  scoreResult.reasoning,
    });

    // 5. Update agent stats
    demo.updateAgent(did, { totalLoans: agent.totalLoans + 1 });

    logger.info('Loan approved (in-memory store)', { loanId: loan.loanId, tier, amount });

    return res.status(201).json({
      success: true,
      data: {
        decision: 'approved',
        loanId:   loan.loanId,
        terms: {
          amount:      loan.amount,
          apr:         loan.apr,
          durationDays:loan.durationDays,
          collateral:  loan.collateral,
          totalDue:    loan.totalDue,
          dueDate:     loan.dueDate,
        },
        scoring: {
          mlScore:           scoreResult.mlScore,
          llmScore:          scoreResult.llmScore,
          combinedScore:     scoreResult.combinedScore,
          defaultProbability:scoreResult.defaultProbability,
          tier,
          reasoning:         scoreResult.reasoning,
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /loans/:id/status ----
router.get('/:id/status', async (req, res, next) => {
  try {
    if (dbReady()) {
      const loan = await loanService.getLoanStatus(req.params.id);
      if (!loan) return res.status(404).json({ error: { message: 'Loan not found', code: 'LOAN_NOT_FOUND' } });
      return res.json({ success: true, data: loan });
    }

    // Demo path
    const loan = demo.findLoanById(req.params.id);
    if (!loan) return res.status(404).json({ error: { message: 'Loan not found (demo mode)', code: 'LOAN_NOT_FOUND' } });
    return res.json({ success: true, data: loan });
  } catch (err) {
    next(err);
  }
});

// ---- POST /loans/:id/disburse (protected) ----
router.post('/:id/disburse', requireApiKey, async (req, res, next) => {
  try {
    if (dbReady()) {
      const result = await loanService.disburseLoan(req.params.id);
      return res.json({ success: true, data: result });
    }

    // In-memory store path - still requires real WDK for disbursement
    const loan = demo.findLoanById(req.params.id);
    if (!loan) return res.status(404).json({ error: { message: 'Loan not found', code: 'LOAN_NOT_FOUND' } });
    if (loan.status !== 'approved') return res.status(400).json({ error: { message: `Cannot disburse a loan with status: ${loan.status}`, code: 'INVALID_STATUS' } });

    // Get borrower's wallet address from agent record
    const agent = demo.findAgentByDid(loan.borrowerDid);
    if (!agent || !agent.walletAddress) {
      return res.status(400).json({ error: { message: 'Borrower wallet address not found', code: 'NO_WALLET' } });
    }

    // Use real WDK to send USDT
    const walletManager = require('../wdk/walletManager');
    const result = await walletManager.sendUSDT(agent.walletAddress, loan.amount);

    demo.updateLoan(req.params.id, { status: 'disbursed', disbursementTxHash: result.hash });
    logger.info('Loan disbursed via WDK', { loanId: loan.loanId, txHash: result.hash });

    return res.json({
      success: true,
      data: { loanId: loan.loanId, status: 'disbursed', txHash: result.hash, amount: loan.amount, dueDate: loan.dueDate, totalDue: loan.totalDue }
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /loans/:id/repay (protected) ----
router.post('/:id/repay', requireApiKey, validateRequest(loanRepaymentSchema), async (req, res, next) => {
  try {
    if (dbReady()) {
      const result = await loanService.processRepayment(req.params.id, req.body.repaymentTxHash);
      return res.json({ success: true, data: result });
    }

    // Demo path
    const loan = demo.findLoanById(req.params.id);
    if (!loan) return res.status(404).json({ error: { message: 'Loan not found', code: 'LOAN_NOT_FOUND' } });
    if (loan.status !== 'disbursed') return res.status(400).json({ error: { message: `Cannot repay a loan with status: ${loan.status}`, code: 'INVALID_STATUS' } });

    const wasOnTime  = new Date() <= new Date(loan.dueDate);
    const scoreDelta = wasOnTime ? 5 : -2;
    const txHash     = req.body.repaymentTxHash || ('0xrepay_' + Date.now());

    demo.updateLoan(req.params.id, { status: 'repaid', repaymentTxHash: txHash });

    // Update agent credit score
    const agent = demo.findAgentByDid(loan.borrowerDid);
    if (agent) {
      const newScore     = Math.min(100, Math.max(0, agent.creditScore + scoreDelta));
      const newRepaid    = agent.totalRepaid + 1;
      const newOnTime    = wasOnTime ? (agent.onTimeRate * agent.totalRepaid + 1) / newRepaid
                                     : (agent.onTimeRate * agent.totalRepaid)     / newRepaid;
      demo.updateAgent(loan.borrowerDid, { creditScore: newScore, totalRepaid: newRepaid, onTimeRate: newOnTime });
    }

    logger.info('Loan repaid (in-memory store)', { loanId: loan.loanId, wasOnTime, scoreDelta });

    return res.json({
      success: true,
      data: {
        loanId:            loan.loanId,
        status:            'repaid',
        repaymentTxHash:   txHash,
        wasOnTime,
        creditScoreChange: scoreDelta,
        newCreditScore:    agent ? Math.min(100, Math.max(0, agent.creditScore + scoreDelta)) : null,
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
