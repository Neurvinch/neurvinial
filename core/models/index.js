// ============================================
// SENTINEL — Model Barrel Export
// ============================================
// Single import point: const { Agent, Loan, Transaction } = require('../models');

const Agent = require('./Agent');
const Loan = require('./Loan');
const Transaction = require('./Transaction');

module.exports = { Agent, Loan, Transaction };
