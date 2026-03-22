// ============================================
// SENTINEL — Agent Model (MongoDB Schema)
// ============================================
// Stores agent identity (DID), wallet address, and credit profile.
// This is the "credit bureau record" for each agent in the economy.

const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  // --- Identity ---
  did: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  walletAddress: {
    type: String,
    required: true
  },
  walletIndex: {
    type: Number,
    default: null
  },
  publicKey: {
    type: String
  },

  // --- Credit Profile ---
  creditScore: {
    type: Number,
    default: 50,    // New agents start at 50 (Tier C — Subprime)
    min: 0,
    max: 100
  },
  tier: {
    type: String,
    enum: ['A', 'B', 'C', 'D'],
    default: 'C'
  },

  // --- Loan History Stats ---
  totalLoans: { type: Number, default: 0 },
  totalRepaid: { type: Number, default: 0 },
  totalDefaulted: { type: Number, default: 0 },
  onTimeRate: { type: Number, default: 0 },

  // --- Status ---
  registeredAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  isBlacklisted: { type: Boolean, default: false },

  // --- Flexible metadata for future use ---
  metadata: { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true  // Adds createdAt and updatedAt automatically
});

module.exports = mongoose.model('Agent', agentSchema);
