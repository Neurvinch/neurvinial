// ============================================
// SENTINEL — Score Engine (Orchestrator)
// ============================================
// Combines ML (60%) and LLM (40%) scores into a single credit decision.
// This is the brain of Sentinel's credit assessment.
//
// Flow:
//   Agent Data → ML Model (60% weight) → |
//                                          | → Combined Score → Tier → Terms
//   Agent Data → LLM Scorer (40% weight) → |

const mlModel = require('./mlModel');
const { getLLMScore } = require('./llmScorer');
const { getTierFromScore } = require('../utils/tierCalculator');
const logger = require('../config/logger');

// Weight split: 60% objective ML, 40% qualitative LLM
const ML_WEIGHT = 0.6;
const LLM_WEIGHT = 0.4;

/**
 * Calculate the full credit score for an agent.
 * @param {object} agentProfile - Agent document from MongoDB
 * @param {object} loanRequest - { amount, purpose }
 * @returns {object} - Full scoring result with scores, tier, and terms
 */
async function calculateCreditScore(agentProfile, loanRequest) {
  // Step 1: ML Score (synchronous — runs in-process)
  const mlResult = mlModel.score({
    totalLoans: agentProfile.totalLoans,
    totalRepaid: agentProfile.totalRepaid,
    totalDefaulted: agentProfile.totalDefaulted,
    onTimeRate: agentProfile.onTimeRate,
    registeredAt: agentProfile.registeredAt,
    recentTxCount: 0, // Could be enriched from on-chain data
    collateralRatio: 0
  });

  // Step 2: LLM Score (async — calls API or rule-based fallback)
  const llmResult = await getLLMScore(agentProfile, loanRequest);

  // Step 3: Weighted combination
  const combinedScore = Math.round(
    (mlResult.mlScore * ML_WEIGHT) + (llmResult.score * LLM_WEIGHT)
  );

  // Step 4: Determine risk tier from combined score
  const tier = getTierFromScore(combinedScore);

  const result = {
    mlScore: mlResult.mlScore,
    llmScore: llmResult.score,
    combinedScore,
    defaultProbability: mlResult.defaultProbability,
    tier: tier.tierLetter,
    tierLabel: tier.label,
    maxLoan: tier.maxLoan,
    apr: tier.apr,
    collateralPct: tier.collateralPct,
    reasoning: llmResult.reasoning,
    mlFeatures: mlResult.features
  };

  logger.info('Credit score calculated', {
    did: agentProfile.did,
    mlScore: mlResult.mlScore,
    llmScore: llmResult.score,
    combinedScore,
    tier: tier.tierLetter,
    defaultProbability: mlResult.defaultProbability.toFixed(4)
  });

  return result;
}

module.exports = { calculateCreditScore };
