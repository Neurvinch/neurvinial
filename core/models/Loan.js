// ============================================
// SENTINEL — Loan Model (MongoDB Schema)
// ============================================
// Tracks the full lifecycle of every loan from request to repayment/default.
// The status enum maps exactly to the loan lifecycle diagram.

const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  // --- Loan Identity ---
  loanId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  borrowerDid: {
    type: String,
    required: true,
    index: true
  },

  // --- Loan Terms ---
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USDT' },
  purpose: { type: String },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'disbursed', 'repaid', 'defaulted', 'liquidated'],
    default: 'pending',
    index: true
  },

  // --- Risk Assessment ---
  tier: { type: String, enum: ['A', 'B', 'C', 'D'] },
  apr: { type: Number },
  collateralRequired: { type: Number, default: 0 },
  collateralDeposited: { type: Number, default: 0 },
  interestAccrued: { type: Number, default: 0 },
  totalDue: { type: Number },

  // --- Scoring Data ---
  mlScore: { type: Number },
  llmScore: { type: Number },
  combinedScore: { type: Number },
  defaultProbability: { type: Number },
  decisionReasoning: { type: String },

  // --- On-Chain References ---
  disbursementTxHash: { type: String },
  repaymentTxHash: { type: String },
  collateralLiquidationTxHash: { type: String },
  collateralLiquidated: { type: Boolean, default: false },
  liquidationError: { type: String },

  // --- Timeline ---
  disbursedAt: { type: Date },
  dueDate: { type: Date },
  repaidAt: { type: Date },
  defaultedAt: { type: Date },

  // --- Notification History ---
  alerts: [{
    type: { type: String },
    sentAt: { type: Date },
    channel: { type: String }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Loan', loanSchema);
