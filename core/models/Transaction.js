// ============================================
// SENTINEL — Transaction Model (MongoDB Schema)
// ============================================
// Records every on-chain transaction: disbursements, repayments,
// collateral movements, liquidations, and capital reallocations.

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  from: { type: String, required: true },
  to: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USDT' },
  type: {
    type: String,
    enum: [
      'disbursement',      // Sentinel → Borrower (loan issued)
      'repayment',         // Borrower → Sentinel (loan repaid)
      'collateral_deposit', // Borrower → Sentinel (collateral locked)
      'collateral_return',  // Sentinel → Borrower (collateral returned)
      'liquidation',       // Collateral sold on default
      'reallocation'       // Idle capital → yield protocol
    ],
    required: true
  },
  loanId: { type: String },
  blockchain: { type: String, default: 'ethereum' },
  network: { type: String, default: 'sepolia' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending'
  },
  blockNumber: { type: Number },
  fee: { type: String },
  confirmedAt: { type: Date }
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);
