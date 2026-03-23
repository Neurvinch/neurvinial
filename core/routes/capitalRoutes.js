// ============================================
// Neurvinial — Capital API Routes (PRODUCTION ONLY)
// ============================================
// GET  /capital/status    — Reserve balance, deployed capital, and yield info
// GET  /capital/lp-pool   — LP agent pool status
// POST /capital/lp/register — Register a new LP agent
// POST /capital/aave/deposit — Deploy idle capital to AAVE
// POST /capital/aave/withdraw — Withdraw from AAVE
//
// NO MOCKS - Requires MongoDB connection for all operations.

const express        = require('express');
const mongoose       = require('mongoose');
const capitalService = require('../reallocator/capitalService');
const lpAgentManager = require('../capital/lpAgentManager');
const aaveIntegration = require('../capital/aaveIntegration');
const { requireApiKey } = require('../middleware/apiAuth');
const logger         = require('../config/logger');

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

// ---- GET /capital/status ----
router.get('/status', requireDB, async (req, res, next) => {
  try {
    const status = await capitalService.getCapitalStatus();
    const lpPool = lpAgentManager.getLPPoolStats();
    const aaveStatus = await aaveIntegration.getAaveStatus();

    return res.json({
      success: true,
      data: {
        ...status,
        lpPool,
        aave: aaveStatus
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /capital/lp-pool ----
router.get('/lp-pool', async (req, res, next) => {
  try {
    const lpPool = lpAgentManager.getLPPoolStats();
    const lpAgents = lpAgentManager.getAllLPAgents();

    return res.json({
      success: true,
      data: {
        pool: lpPool,
        agents: lpAgents
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /capital/lp/register ----
router.post('/lp/register', requireApiKey, async (req, res, next) => {
  try {
    const { did, walletAddress, maxCapital, apr, name } = req.body;

    if (!did || !walletAddress || !maxCapital) {
      return res.status(400).json({
        error: {
          message: 'Missing required fields: did, walletAddress, maxCapital',
          code: 'INVALID_REQUEST'
        }
      });
    }

    const lpAgent = await lpAgentManager.registerLPAgent({
      did,
      walletAddress,
      maxCapital,
      apr: apr || 0.02,
      name: name || 'LP Agent'
    });

    logger.info('LP Agent registered via API', { lpId: lpAgent.id, did });

    return res.status(201).json({
      success: true,
      data: lpAgent
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /capital/aave/deposit ----
router.post('/aave/deposit', requireDB, requireApiKey, async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: {
          message: 'Invalid deposit amount',
          code: 'INVALID_AMOUNT'
        }
      });
    }

    const result = await aaveIntegration.depositToAave(amount);

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /capital/aave/withdraw ----
router.post('/aave/withdraw', requireDB, requireApiKey, async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: {
          message: 'Invalid withdrawal amount',
          code: 'INVALID_AMOUNT'
        }
      });
    }

    const result = await aaveIntegration.withdrawFromAave(amount);

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /capital/aave/status ----
router.get('/aave/status', async (req, res, next) => {
  try {
    const status = await aaveIntegration.getAaveStatus();
    return res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
