// ============================================
// SENTINEL — Agent API Routes
// ============================================
// POST /agents/register  — Register a new agent DID
// GET  /agents/:did/score — Fetch credit score + tier for a given DID
// GET  /agents/:did       — Get full agent profile (DID Document)

const express = require('express');
const Joi = require('joi');
const validateRequest = require('../middleware/validateRequest');
const didService = require('../../did/didService');
const { Agent } = require('../models');
const logger = require('../config/logger');

const router = express.Router();

// ---- Validation Schemas ----
const registerSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  type: Joi.string().max(50).optional(),       // e.g., 'trading-bot', 'service-agent'
  description: Joi.string().max(500).optional()
});

// ---- POST /agents/register ----
// Register a new agent. Sentinel creates a wallet and DID automatically.
router.post('/register', validateRequest(registerSchema), async (req, res, next) => {
  try {
    const result = await didService.registerAgent(req.body);

    res.status(201).json({
      success: true,
      data: {
        did: result.did,
        walletAddress: result.walletAddress,
        creditScore: result.creditScore,
        tier: result.tier,
        message: 'Agent registered successfully. Your DID is your identity in the Sentinel network.'
      }
    });
  } catch (err) {
    // Handle duplicate DID
    if (err.code === 11000) {
      return res.status(409).json({
        error: {
          message: 'Agent already registered',
          code: 'DUPLICATE_AGENT'
        }
      });
    }
    next(err);
  }
});

// ---- GET /agents/:did/score ----
// Returns the credit score and risk tier for a given DID.
router.get('/:did/score', async (req, res, next) => {
  try {
    const did = decodeURIComponent(req.params.did);
    const profile = await didService.resolveDID(did);

    if (!profile) {
      return res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: {
        did: profile.did,
        creditScore: profile.creditScore,
        tier: profile.tier,
        totalLoans: profile.totalLoans,
        totalRepaid: profile.totalRepaid,
        totalDefaulted: profile.totalDefaulted,
        onTimeRate: profile.onTimeRate,
        isBlacklisted: profile.isBlacklisted
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /agents/:did ----
// Returns the full DID Document (W3C format) for a given DID.
router.get('/:did', async (req, res, next) => {
  try {
    const did = decodeURIComponent(req.params.did);
    const agent = await Agent.findOne({ did });

    if (!agent) {
      return res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        }
      });
    }

    const didDocument = didService.createDIDDocument(agent);

    res.json({
      success: true,
      data: {
        agent: {
          did: agent.did,
          walletAddress: agent.walletAddress,
          creditScore: agent.creditScore,
          tier: agent.tier,
          registeredAt: agent.registeredAt
        },
        didDocument
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
