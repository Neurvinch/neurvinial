// ============================================
// Neurvinial — ML Credit Scoring Model (Pure Node.js)
// ============================================
// Logistic regression implemented in pure JavaScript using functions.
// No Python dependency needed.
//
// Features used (6 total):
//   1. on_time_rate       — fraction of loans repaid before deadline (0-1)
//   2. loan_frequency     — number of loans in last 90 days
//   3. avg_loan_duration  — average days to repay
//   4. collateral_ratio   — collateral value / loan value (0-1+)
//   5. tx_velocity        — on-chain transactions in last 30 days
//   6. wallet_age_days    — age of wallet in days

const logger = require('../config/logger');

// Pre-trained weights (logistic regression coefficients)
const WEIGHTS = {
  on_time_rate: -3.5,       // Strong negative: high repayment rate → low default
  loan_frequency: 0.15,     // Slight positive: too many loans signals risk
  avg_loan_duration: 0.02,  // Slight positive: longer duration = more risk
  collateral_ratio: -2.0,   // Strong negative: more collateral → lower default
  tx_velocity: -0.05,       // Slight negative: more activity → more trustworthy
  wallet_age_days: -0.008   // Negative: older wallet → lower default
};

const BIAS = 1.2;

const NORMALIZATION = {
  on_time_rate:      { mean: 0.7,  std: 0.25 },
  loan_frequency:    { mean: 3.0,  std: 2.5 },
  avg_loan_duration: { mean: 20.0, std: 10.0 },
  collateral_ratio:  { mean: 0.3,  std: 0.25 },
  tx_velocity:       { mean: 15.0, std: 10.0 },
  wallet_age_days:   { mean: 90.0, std: 60.0 }
};

/**
 * Sigmoid function: maps any real number to (0, 1).
 */
function sigmoid(x) {
  const clamped = Math.max(-500, Math.min(500, x));
  return 1 / (1 + Math.exp(-clamped));
}

/**
 * Normalize a feature value using z-score normalization.
 */
function normalize(featureName, value) {
  const { mean, std } = NORMALIZATION[featureName];
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * Extract features from agent profile data.
 */
function extractFeatures(agentData) {
  const now = new Date();

  const totalLoans = agentData.totalLoans || 0;
  const totalRepaid = agentData.totalRepaid || 0;
  const onTimeRate = totalLoans > 0 ? totalRepaid / totalLoans : 0.5;

  const loanFrequency = agentData.recentLoanCount || totalLoans;
  const avgLoanDuration = agentData.avgLoanDurationDays || 20;
  const collateralRatio = agentData.collateralRatio || 0;
  const txVelocity = agentData.recentTxCount || 0;

  const registeredAt = agentData.registeredAt ? new Date(agentData.registeredAt) : now;
  const walletAgeDays = Math.max(1, (now - registeredAt) / (1000 * 60 * 60 * 24));

  return {
    on_time_rate: onTimeRate,
    loan_frequency: loanFrequency,
    avg_loan_duration: avgLoanDuration,
    collateral_ratio: collateralRatio,
    tx_velocity: txVelocity,
    wallet_age_days: walletAgeDays
  };
}

/**
 * Predict the probability of default for an agent.
 */
function predictDefaultProbability(agentData) {
  const features = extractFeatures(agentData);

  // Compute logit: z = bias + sum(weight_i * normalized_feature_i)
  let logit = BIAS;
  for (const [featureName, weight] of Object.entries(WEIGHTS)) {
    const normalizedValue = normalize(featureName, features[featureName]);
    logit += weight * normalizedValue;
  }

  const defaultProbability = sigmoid(logit);

  logger.debug('ML prediction', {
    features,
    logit: logit.toFixed(4),
    defaultProbability: defaultProbability.toFixed(4)
  });

  return {
    defaultProbability,
    features,
    featureWeights: WEIGHTS
  };
}

/**
 * Convert default probability to a credit score (0-100).
 */
function defaultProbToScore(defaultProbability) {
  return Math.round((1 - defaultProbability) * 100);
}

/**
 * Full scoring pipeline: agent data → default probability → credit score.
 */
function score(agentData) {
  const { defaultProbability, features, featureWeights } = predictDefaultProbability(agentData);
  const mlScore = defaultProbToScore(defaultProbability);

  return {
    mlScore,
    defaultProbability,
    features,
    featureWeights
  };
}

module.exports = {
  score,
  predictDefaultProbability,
  defaultProbToScore,
  normalize,
  sigmoid,
  extractFeatures
};
