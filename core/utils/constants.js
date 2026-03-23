// ============================================
// Neurvinial — Risk Tier Constants
// ============================================
// These are the risk tiers from the project specification.
// Every loan decision references this table.

const RISK_TIERS = {
  A: {
    label: 'Prime',
    minScore: 80,
    maxScore: 100,
    apr: 0.04,         // 4% annual
    maxLoan: 10000,    // 10,000 USDT
    collateralPct: 0   // No collateral required
  },
  B: {
    label: 'Standard',
    minScore: 60,
    maxScore: 79,
    apr: 0.09,         // 9% annual
    maxLoan: 3000,     // 3,000 USDT
    collateralPct: 0.25 // 25% collateral
  },
  C: {
    label: 'Subprime',
    minScore: 40,
    maxScore: 59,
    apr: 0.18,         // 18% annual
    maxLoan: 500,      // 500 USDT
    collateralPct: 0.50 // 50% collateral
  },
  D: {
    label: 'Denied',
    minScore: 0,
    maxScore: 39,
    apr: null,          // No loan issued
    maxLoan: 0,
    collateralPct: null
  }
};

// Loan status lifecycle
const LOAN_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
  DISBURSED: 'disbursed',
  REPAID: 'repaid',
  DEFAULTED: 'defaulted',
  LIQUIDATED: 'liquidated'
};

// Credit score adjustment values
const SCORE_ADJUSTMENTS = {
  ON_TIME_REPAYMENT: 5,     // +5 for on-time repayment
  LATE_REPAYMENT: -2,       // -2 for late repayment
  DEFAULT_PENALTY: -20,     // -20 for default
  MAX_DEFAULTS_BEFORE_BAN: 3 // Blacklisted after 3 defaults
};

module.exports = { RISK_TIERS, LOAN_STATUSES, SCORE_ADJUSTMENTS };
