// ============================================
// SENTINEL — Capital API Routes
// ============================================
// GET /capital/status — Reserve balance, deployed capital, and yield info

const express        = require('express');
const mongoose       = require('mongoose');
const capitalService = require('../reallocator/capitalService');
const demo           = require('../demo/demoStore');

const router = express.Router();

function dbReady() { return mongoose.connection.readyState === 1; }

// ---- GET /capital/status ----
router.get('/status', async (req, res, next) => {
  try {
    // ── Live MongoDB path ──────────────────────────────────────
    if (dbReady()) {
      const status = await capitalService.getCapitalStatus();
      return res.json({ success: true, data: status });
    }

    // ── Demo path ──────────────────────────────────────────────
    const metrics      = demo.getCapitalMetrics();
    const opportunities = [
      { protocol: 'Aave V3',        asset: 'USDT', apy: 4.2, risk: 'low',    tvl: '1.2B' },
      { protocol: 'Compound',       asset: 'USDT', apy: 3.8, risk: 'low',    tvl: '890M' },
      { protocol: 'Sentinel Pool A',asset: 'USDT', apy: 9.0, risk: 'medium', tvl: 'N/A'  },
      { protocol: 'Sentinel Pool B',asset: 'USDT', apy: 18.0,risk: 'high',   tvl: 'N/A'  },
    ];

    return res.json({
      success: true,
      data: {
        ...metrics,
        yieldOpportunities: opportunities,
        mode: 'demo',
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
