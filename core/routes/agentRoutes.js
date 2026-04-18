// ============================================
// Neurvinial — Agent API Routes (PRODUCTION ONLY)
// ============================================
// POST /agents/register  — Register a new agent DID
// GET  /agents/:did/score — Fetch credit score + tier for a given DID
// GET  /agents/:did       — Get full agent profile (DID Document)
//
// NO MOCKS - Requires MongoDB connection for all operations.

const express  = require('express');
const Joi      = require('joi');
const mongoose = require('mongoose');
const validateRequest = require('../middleware/validateRequest');
const didService      = require('../../did/didService');
const { Agent }       = require('../models');
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

// ---- Validation Schemas ----
const registerSchema = Joi.object({
  name:        Joi.string().max(100).optional(),
  type:        Joi.string().max(50).optional(),
  description: Joi.string().max(500).optional(),
}).unknown(true);

// ---- POST /agents/register ----
router.post('/register', requireDB, validateRequest(registerSchema), async (req, res, next) => {
  try {
    const result = await didService.registerAgent(req.body);

    logger.info('Agent registered via API', { did: result.did });

    return res.status(201).json({
      success: true,
      data: {
        did:           result.did,
        walletAddress: result.walletAddress,
        creditScore:   result.creditScore,
        tier:          result.tier,
        message:       'Agent registered successfully.',
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: { message: 'Agent already registered', code: 'DUPLICATE_AGENT' } });
    }
    next(err);
  }
});

// ---- GET /agents/:did/score ----
router.get('/:did/score', requireDB, async (req, res, next) => {
  try {
    const did = decodeURIComponent(req.params.did);
    const profile = await didService.resolveDID(did);

    if (!profile) {
      return res.status(404).json({ error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } });
    }

    return res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

// ---- GET /agents/:did ----
router.get('/:did', requireDB, async (req, res, next) => {
  try {
    const did = decodeURIComponent(req.params.did);
    const agent = await Agent.findOne({ did });

    if (!agent) {
      return res.status(404).json({ error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } });
    }

    return res.json({
      success: true,
      data: {
        agent,
        didDocument: didService.createDIDDocument(agent)
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
