// ============================================
// SENTINEL — Agent API Routes
// ============================================
// POST /agents/register  — Register a new agent DID
// GET  /agents/:did/score — Fetch credit score + tier for a given DID
// GET  /agents/:did       — Get full agent profile (DID Document)

const express  = require('express');
const Joi      = require('joi');
const mongoose = require('mongoose');
const validateRequest = require('../middleware/validateRequest');
const didService      = require('../../did/didService');
const { Agent }       = require('../models');
const demo            = require('../demo/demoStore');
const logger          = require('../config/logger');

const router = express.Router();

// Returns true when MongoDB is connected and ready
function dbReady() {
  return mongoose.connection.readyState === 1;
}

// ---- Validation Schemas ----
const registerSchema = Joi.object({
  name:        Joi.string().max(100).optional(),
  type:        Joi.string().max(50).optional(),
  description: Joi.string().max(500).optional(),
}).unknown(true);

// ---- POST /agents/register ----
router.post('/register', validateRequest(registerSchema), async (req, res, next) => {
  try {
    // ── Live MongoDB path ──────────────────────────────────────
    if (dbReady()) {
      const result = await didService.registerAgent(req.body);
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
    }

    // ── In-memory path (no MongoDB) ──────────────────────────
    // Uses WDK-derived wallet addresses
    const agentCount = demo.countAgents();
    const agent = await demo.createAgent({ name: req.body.name || `Agent-${agentCount + 1}`, walletIndex: agentCount + 1 });
    logger.info('Agent registered (in-memory store)', { did: agent.did });

    return res.status(201).json({
      success: true,
      data: {
        did:           agent.did,
        walletAddress: agent.walletAddress,
        creditScore:   agent.creditScore,
        tier:          agent.tier,
        message:       'Registered using in-memory store (no MongoDB). WDK wallet address derived.',
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
router.get('/:did/score', async (req, res, next) => {
  try {
    const did = decodeURIComponent(req.params.did);

    if (dbReady()) {
      const profile = await didService.resolveDID(did);
      if (!profile) return res.status(404).json({ error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } });
      return res.json({ success: true, data: profile });
    }

    // In-memory path
    const agent = demo.findAgentByDid(did);
    if (!agent) return res.status(404).json({ error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } });

    return res.json({
      success: true,
      data: {
        did:            agent.did,
        creditScore:    agent.creditScore,
        tier:           agent.tier,
        totalLoans:     agent.totalLoans,
        totalRepaid:    agent.totalRepaid,
        totalDefaulted: agent.totalDefaulted,
        onTimeRate:     agent.onTimeRate,
        isBlacklisted:  agent.isBlacklisted,
        lastActivity:   agent.lastActivity,
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /agents/:did ----
router.get('/:did', async (req, res, next) => {
  try {
    const did = decodeURIComponent(req.params.did);

    if (dbReady()) {
      const agent = await Agent.findOne({ did });
      if (!agent) return res.status(404).json({ error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } });
      return res.json({ success: true, data: { agent, didDocument: didService.createDIDDocument(agent) } });
    }

    // In-memory path
    const agent = demo.findAgentByDid(did);
    if (!agent) return res.status(404).json({ error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } });

    return res.json({ success: true, data: { agent, didDocument: didService.createDIDDocument(agent) } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
