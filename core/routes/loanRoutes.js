// ============================================
// SENTINEL — Loan API Routes
// ============================================
// POST /loans/request      — Submit a loan request
// GET  /loans/:id/status   — Poll loan status
// POST /loans/:id/repay    — Trigger repayment
// POST /loans/:id/disburse — Disburse an approved loan

const express = require('express');
const Joi = require('joi');
const validateRequest = require('../middleware/validateRequest');
const loanService = require('../loans/loanService');
const logger = require('../config/logger');

const router = express.Router();

// ---- Validation Schemas ----
const loanRequestSchema = Joi.object({
  did: Joi.string().required().messages({
    'any.required': 'Agent DID is required'
  }),
  amount: Joi.number().positive().max(10000).required().messages({
    'number.positive': 'Loan amount must be positive',
    'number.max': 'Maximum loan amount is 10,000 USDT',
    'any.required': 'Loan amount is required'
  }),
  purpose: Joi.string().max(500).optional()
});

const repaySchema = Joi.object({
  txHash: Joi.string().optional() // Optional: if borrower provides their repayment tx hash
});

// ---- POST /loans/request ----
// Submit a loan request. Sentinel scores and approves/denies immediately.
router.post('/request', validateRequest(loanRequestSchema), async (req, res, next) => {
  try {
    const { did, amount, purpose } = req.body;
    const result = await loanService.requestLoan({ did, amount, purpose });

    const statusCode = result.decision === 'approved' ? 201 : 200;

    res.status(statusCode).json({
      success: true,
      data: {
        decision: result.decision,
        loanId: result.loan.loanId,
        reason: result.reason || undefined,
        terms: result.terms || undefined,
        scoring: {
          mlScore: result.loan.mlScore,
          llmScore: result.loan.llmScore,
          combinedScore: result.loan.combinedScore,
          defaultProbability: result.loan.defaultProbability,
          tier: result.loan.tier,
          reasoning: result.loan.decisionReasoning
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /loans/:id/status ----
// Poll the status of a loan.
router.get('/:id/status', async (req, res, next) => {
  try {
    const loan = await loanService.getLoanStatus(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: { message: 'Loan not found', code: 'LOAN_NOT_FOUND' }
      });
    }

    res.json({
      success: true,
      data: {
        loanId: loan.loanId,
        status: loan.status,
        borrowerDid: loan.borrowerDid,
        amount: loan.amount,
        tier: loan.tier,
        apr: loan.apr,
        totalDue: loan.totalDue,
        dueDate: loan.dueDate,
        disbursementTxHash: loan.disbursementTxHash,
        repaymentTxHash: loan.repaymentTxHash,
        createdAt: loan.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /loans/:id/disburse ----
// Disburse an approved loan. Sends USDT on-chain via WDK.
router.post('/:id/disburse', async (req, res, next) => {
  try {
    const result = await loanService.disburseLoan(req.params.id);

    res.json({
      success: true,
      data: {
        loanId: result.loan.loanId,
        status: result.loan.status,
        txHash: result.txHash,
        fee: result.fee,
        amount: result.loan.amount,
        dueDate: result.loan.dueDate,
        totalDue: result.loan.totalDue
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /loans/:id/repay ----
// Process loan repayment.
router.post('/:id/repay', validateRequest(repaySchema), async (req, res, next) => {
  try {
    const result = await loanService.processRepayment(req.params.id, req.body.txHash);

    res.json({
      success: true,
      data: {
        loanId: result.loan.loanId,
        status: result.loan.status,
        repaymentTxHash: result.repaymentTxHash,
        wasOnTime: result.wasOnTime,
        creditScoreChange: result.creditScoreChange,
        newCreditScore: result.newCreditScore,
        newTier: result.newTier
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
