// ============================================
// SENTINEL — Tier Calculator
// ============================================
// Pure function: score (0-100) → tier object.
// Isolated so it can be unit tested independently.

const { RISK_TIERS } = require('./constants');

/**
 * Given a credit score (0-100), returns the matching risk tier.
 * @param {number} score - Credit score between 0 and 100
 * @returns {object} - { tierLetter, label, apr, maxLoan, collateralPct }
 */
function getTierFromScore(score) {
  // Clamp score to valid range
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  // Check tiers in order: A → B → C → D
  for (const [letter, tier] of Object.entries(RISK_TIERS)) {
    if (clamped >= tier.minScore && clamped <= tier.maxScore) {
      return {
        tierLetter: letter,
        label: tier.label,
        apr: tier.apr,
        maxLoan: tier.maxLoan,
        collateralPct: tier.collateralPct
      };
    }
  }

  // Fallback (should never reach here with valid RISK_TIERS)
  return {
    tierLetter: 'D',
    label: 'Denied',
    apr: null,
    maxLoan: 0,
    collateralPct: null
  };
}

module.exports = { getTierFromScore };
