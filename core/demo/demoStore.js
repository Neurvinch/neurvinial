// ============================================
// Neurvinial — In-Memory Data Store
// ============================================
// Powers ALL endpoints when MongoDB is unavailable.
// Data survives for the life of the process only.
// Provides the same interface shape as the real MongoDB models.
//
// Note: This store is for testing without MongoDB. On-chain
// operations (disbursements) still use real WDK transactions.

const { v4: uuid } = require('uuid');

// ---- Stores ----
const agents = new Map();  // key: did  → value: agent object
const loans  = new Map();  // key: id   → value: loan object

// Wallet index counter for WDK account derivation
let walletIndexCounter = 1;

// ---- Helpers ----
function now()    { return new Date().toISOString(); }
function loanId() { return 'loan_' + uuid().replace(/-/g, '').slice(0, 16); }

// ---- AGENTS ----

/**
 * Create a new agent with a WDK-derived wallet address.
 * Uses the walletManager to generate a real blockchain address.
 */
async function createAgent({ name = 'Agent', walletIndex = null } = {}) {
  const walletManager = require('../wdk/walletManager');

  // Use provided index or auto-increment
  const index = walletIndex !== null ? walletIndex : walletIndexCounter++;

  // Get real WDK-derived wallet address
  const { address } = await walletManager.createWalletForAgent(index);
  const did = `did:sentinel:${address.toLowerCase()}`;

  const agent = {
    _id:            uuid(),
    did,
    walletAddress:  address,
    walletIndex:    index,
    creditScore:    50,
    tier:           'C',
    totalLoans:     0,
    totalRepaid:    0,
    totalDefaulted: 0,
    onTimeRate:     0,
    isBlacklisted:  false,
    registeredAt:   now(),
    lastActivity:   now(),
    metadata:       { name, walletIndex: index },
  };
  agents.set(did, agent);
  return agent;
}

function findAgentByDid(did) {
  return agents.get(did) || null;
}

function countAgents() {
  return agents.size;
}

function updateAgent(did, changes) {
  const agent = agents.get(did);
  if (!agent) return null;
  Object.assign(agent, changes, { lastActivity: now() });
  return agent;
}

// ---- LOANS ----

function createLoan({ borrowerDid, amount, purpose, mlScore, llmScore, combinedScore,
                      defaultProbability, tier, apr, collateral, durationDays, decisionReasoning }) {
  const id       = loanId();
  const dueDate  = new Date(Date.now() + durationDays * 86_400_000).toISOString();
  const totalDue = parseFloat((amount * (1 + apr * durationDays / 365)).toFixed(2));

  const loan = {
    _id:                 id,
    loanId:              id,
    borrowerDid,
    amount,
    purpose:             purpose || 'general',
    status:              'approved',
    tier,
    apr,
    collateral:          collateral || 0,
    durationDays,
    dueDate,
    totalDue,
    mlScore,
    llmScore,
    combinedScore,
    defaultProbability,
    decisionReasoning,
    disbursementTxHash:  null,
    repaymentTxHash:     null,
    createdAt:           now(),
  };
  loans.set(id, loan);
  return loan;
}

function findLoanById(id) {
  return loans.get(id) || null;
}

function updateLoan(id, changes) {
  const loan = loans.get(id);
  if (!loan) return null;
  Object.assign(loan, changes);
  return loan;
}

// ---- CAPITAL ----
// Derives capital metrics live from the loans store

function getCapitalMetrics() {
  const TOTAL_CAPITAL = 50_000; // Reserve fund (configurable via env in production)

  let deployed           = 0;
  let interestEarned     = 0;
  let capitalLost        = 0;
  let activeCount        = 0;
  let repaidCount        = 0;
  let defaultedCount     = 0;

  for (const loan of loans.values()) {
    if (loan.status === 'disbursed') {
      deployed    += loan.amount;
      activeCount += 1;
    }
    if (loan.status === 'repaid') {
      interestEarned += loan.totalDue - loan.amount;
      repaidCount    += 1;
    }
    if (loan.status === 'defaulted') {
      capitalLost     += loan.amount;
      defaultedCount  += 1;
    }
  }

  const idle = Math.max(0, TOTAL_CAPITAL - deployed - capitalLost);

  return {
    totalCapital:        TOTAL_CAPITAL,
    deployedCapital:     parseFloat(deployed.toFixed(2)),
    idleCapital:         parseFloat(idle.toFixed(2)),
    totalInterestEarned: parseFloat(interestEarned.toFixed(2)),
    capitalLost:         parseFloat(capitalLost.toFixed(2)),
    activeLoans:         activeCount,
    repaidLoans:         repaidCount,
    defaultedLoans:      defaultedCount,
    totalLoans:          loans.size,
  };
}

// ---- Exports ----
module.exports = {
  // Agents
  createAgent,
  findAgentByDid,
  countAgents,
  updateAgent,
  // Loans
  createLoan,
  findLoanById,
  updateLoan,
  // Capital
  getCapitalMetrics,
};
