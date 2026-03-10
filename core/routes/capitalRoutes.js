// ============================================
// SENTINEL — Capital API Routes
// ============================================
// GET /capital/status — Returns current reserve balance, deployed capital, and yield info

const express = require('express');
const capitalService = require('../reallocator/capitalService');

const router = express.Router();

// ---- GET /capital/status ----
router.get('/status', async (req, res, next) => {
  try {
    const status = await capitalService.getCapitalStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
