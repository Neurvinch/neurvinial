// ============================================
// Neurvinial — Loan API Routes (PRODUCTION ONLY)
// ============================================
// POST /loans/request      — Submit a loan request
// GET  /loans/:id/status   — Poll loan status
// POST /loans/:id/disburse — Disburse an approved loan
// POST /loans/:id/repay    — Process repayment
//
// NO MOCKS - Requires MongoDB connection for all operations.

const express  = require('express');
const mongoose = require('mongoose');
const validateRequest = require('../middleware/validateRequest');
const { requireApiKey } = require('../middleware/apiAuth');
const {
  loanRequestSchema,
  loanRepaymentSchema
} = require('../middleware/schemas');
const loanService     = require('../loans/loanService');
const lpAgentManager  = require('../capital/lpAgentManager');
const { RISK_TIERS }  = require('../utils/constants');
const logger          = require('../config/logger');

const router = express.Router();

// Require MongoDB connection - NO FALLBACK
function requireDB(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: {
        message: 'Database not connected. Neurvinial requires MongoDB for production operations.',
        code: 'DB_NOT_CONNECTED'
      }
    });
  }
  next();
}

// ---- POST /loans/request (protected) ----
router.post('/request', requireDB, requireApiKey, validateRequest(loanRequestSchema), async (req, res, next) => {
  try {
    const { did, amount, purpose } = req.body;

    // Production MongoDB path - NO FALLBACK
    const result = await loanService.requestLoan({ did, amount, purpose });

    // Check if LP capital is needed
    if (result.decision === 'approved') {
      const lpPoolStats = lpAgentManager.getLPPoolStats();
      logger.info('Loan approved with LP pool available', {
        loanId: result.loan.loanId,
        lpCapitalAvailable: lpPoolStats.totalCapitalAvailable
      });
    }

    const statusCode = result.decision === 'approved' ? 201 : 200;
    return res.status(statusCode).json({
      success: true,
      data: {
        decision: result.decision,
        loanId: result.loan.loanId,
        reason: result.reason,
        terms: result.terms,
        scoring: {
          mlScore: result.loan.mlScore,
          llmScore: result.loan.llmScore,
          combinedScore: result.loan.combinedScore,
          defaultProbability: result.loan.defaultProbability,
          tier: result.loan.tier,
          reasoning: result.loan.decisionReasoning,
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /loans/:id/status ----
router.get('/:id/status', requireDB, async (req, res, next) => {
  try {
    const loan = await loanService.getLoanStatus(req.params.id);
    if (!loan) {
      return res.status(404).json({ error: { message: 'Loan not found', code: 'LOAN_NOT_FOUND' } });
    }
    return res.json({ success: true, data: loan });
  } catch (err) {
    next(err);
  }
});

// ---- POST /loans/:id/disburse (protected) ----
router.post('/:id/disburse', requireDB, requireApiKey, async (req, res, next) => {
  try {
    const result = await loanService.disburseLoan(req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ---- POST /loans/:id/repay (protected) ----
router.post('/:id/repay', requireDB, requireApiKey, validateRequest(loanRepaymentSchema), async (req, res, next) => {
  try {
    const result = await loanService.processRepayment(req.params.id, req.body.repaymentTxHash);

    // If loan was funded by LP agent, repay the LP
    if (result.loan && result.loan.lpAgentId) {
      await lpAgentManager.repayLPAgent(
        result.loan.lpAgentId,
        result.loan.amount,
        result.loan.interestAccrued || 0
      );
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
