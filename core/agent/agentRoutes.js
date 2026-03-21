// ============================================
// SENTINEL — OpenClaw API Routes
// ============================================
// Exposes OpenClaw agent skills via REST API.
// Allows external agents to invoke Sentinel's skills.
//
// Endpoints:
//   GET  /agent/skills           — List available skills
//   POST /agent/invoke/:skill    — Invoke a skill with context
//   GET  /agent/status           — Get OpenClaw runtime status

const express = require('express');
const { requireApiKey } = require('../middleware/apiAuth');
const { openClaw, assessCredit, makeLendingDecision, initiateRecovery } = require('./openclawIntegration');
const logger = require('../config/logger');

const router = express.Router();

// ---- GET /agent/skills — List all available skills ----
router.get('/skills', async (req, res, next) => {
  try {
    // Initialize if not already done
    if (!openClaw.initialized) {
      await openClaw.initialize();
    }

    const skills = openClaw.getSkills();

    res.json({
      success: true,
      data: {
        skillCount: skills.length,
        skills: skills.map(s => ({
          name: s.name,
          description: s.description,
          endpoint: `/agent/invoke/${s.name}`
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- GET /agent/status — Get OpenClaw runtime status ----
router.get('/status', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        initialized: openClaw.initialized,
        skillCount: openClaw.skills?.size || 0,
        skills: Array.from(openClaw.skills?.keys() || []),
        config: openClaw.config ? {
          entriesCount: Object.keys(openClaw.config.skills?.entries || {}).length
        } : null
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /agent/invoke/:skill — Invoke a specific skill (protected) ----
router.post('/invoke/:skill', requireApiKey, async (req, res, next) => {
  try {
    const { skill } = req.params;
    const context = req.body;

    // Validate skill exists
    if (!openClaw.hasSkill(skill)) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Skill not found: ${skill}`,
          code: 'SKILL_NOT_FOUND',
          availableSkills: openClaw.getSkills().map(s => s.name)
        }
      });
    }

    logger.info('OpenClaw skill invocation requested', { skill, context });

    // Invoke the skill
    const result = await openClaw.invokeSkill(skill, context);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /agent/credit — Quick credit assessment (protected) ----
router.post('/credit', requireApiKey, async (req, res, next) => {
  try {
    const { did, creditScore, tier, totalLoans, totalRepaid, onTimeRate } = req.body;

    if (!did) {
      return res.status(400).json({
        success: false,
        error: { message: 'did is required', code: 'VALIDATION_ERROR' }
      });
    }

    const result = await assessCredit({
      did,
      creditScore: creditScore || 50,
      tier: tier || 'C',
      totalLoans: totalLoans || 0,
      totalRepaid: totalRepaid || 0,
      onTimeRate: onTimeRate || 0
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /agent/lending-decision — Quick lending decision (protected) ----
router.post('/lending-decision', requireApiKey, async (req, res, next) => {
  try {
    const { did, amount, purpose } = req.body;

    if (!did || !amount) {
      return res.status(400).json({
        success: false,
        error: { message: 'did and amount are required', code: 'VALIDATION_ERROR' }
      });
    }

    const result = await makeLendingDecision({
      did,
      amount,
      purpose: purpose || 'general'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /agent/recovery — Initiate recovery process (protected) ----
router.post('/recovery', requireApiKey, async (req, res, next) => {
  try {
    const { loanId, borrowerDid, totalDue, dueDate, status } = req.body;

    if (!loanId) {
      return res.status(400).json({
        success: false,
        error: { message: 'loanId is required', code: 'VALIDATION_ERROR' }
      });
    }

    const result = await initiateRecovery({
      loanId,
      borrowerDid,
      totalDue,
      dueDate,
      status: status || 'overdue'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /agent/reload — Reload skills from disk (protected) ----
router.post('/reload', requireApiKey, async (req, res, next) => {
  try {
    await openClaw.reload();

    res.json({
      success: true,
      data: {
        message: 'Skills reloaded',
        skillCount: openClaw.skills.size,
        skills: Array.from(openClaw.skills.keys())
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
