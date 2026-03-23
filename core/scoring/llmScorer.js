// ============================================
// Neurvinial — LLM Credit Scorer
// ============================================
// Uses Groq API to provide fast qualitative credit assessment.
// This is the "40% qualitative signal" from the scoring engine.
//
// The LLM evaluates things the ML model cannot:
//   - Stated loan purpose (revenue-generating vs. speculative)
//   - Agent type (established service vs. new bot)
//   - Contextual risk factors
//
// Falls back to a rule-based scorer if API key is not configured.
// Groq is chosen for speed — real-time inference perfect for lending decisions.

const config = require('../config');
const logger = require('../config/logger');

/**
 * Get a qualitative credit score from the LLM.
 * @param {object} agentProfile - Agent data from MongoDB
 * @param {object} loanRequest - The current loan request { amount, purpose }
 * @returns {object} - { score: 0-100, reasoning: string }
 */
async function getLLMScore(agentProfile, loanRequest) {
  // If Groq API key is available, use Groq
  if (config.groq.apiKey) {
    try {
      return await getGroqScore(agentProfile, loanRequest);
    } catch (err) {
      logger.warn('Groq scoring failed, falling back to rule-based', { error: err.message });
      return getRuleBasedScore(agentProfile, loanRequest);
    }
  }

  // Fallback: rule-based scoring
  return getRuleBasedScore(agentProfile, loanRequest);
}

/**
 * Use Groq API to score the agent.
 * Groq provides ultrafast LLM inference — ideal for real-time lending decisions.
 */
async function getGroqScore(agentProfile, loanRequest) {
  const Groq = require('groq-sdk');
  const client = new Groq({ apiKey: config.groq.apiKey });

  const walletAgeDays = Math.max(1,
    (Date.now() - new Date(agentProfile.registeredAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const prompt = `You are a credit analyst for Sentinel, an autonomous agent lending system.
Evaluate this AI agent's creditworthiness on a scale of 0-100.

Agent Profile:
- DID: ${agentProfile.did}
- Wallet Age: ${Math.round(walletAgeDays)} days
- Total Loans Taken: ${agentProfile.totalLoans}
- Loans Repaid: ${agentProfile.totalRepaid}
- Defaults: ${agentProfile.totalDefaulted}
- On-Time Repayment Rate: ${(agentProfile.onTimeRate * 100).toFixed(1)}%
- Is Blacklisted: ${agentProfile.isBlacklisted}

Loan Request:
- Amount: ${loanRequest.amount} USDT
- Purpose: ${loanRequest.purpose || 'Not stated'}

Consider these factors:
1. Is the stated purpose revenue-generating or speculative?
2. Does the agent's history show responsible borrowing?
3. Is the requested amount reasonable relative to their history?
4. Are there any red flags (multiple defaults, blacklist status)?

Respond with ONLY a valid JSON object (no markdown, no explanation outside the JSON):
{"score": <number 0-100>, "reasoning": "<one sentence explanation>"}`;

  const response = await client.messages.create({
    model: 'mixtral-8x7b-32768',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.choices[0].message.content.trim();

  // Parse the JSON response
  const parsed = JSON.parse(text);
  const score = Math.max(0, Math.min(100, Math.round(parsed.score)));

  logger.info('Groq credit assessment', {
    did: agentProfile.did,
    score,
    reasoning: parsed.reasoning
  });

  return {
    score,
    reasoning: parsed.reasoning
  };
}

/**
 * Rule-based scorer (fallback when no API key).
 * Uses simple heuristics to approximate what the LLM would say.
 */
function getRuleBasedScore(agentProfile, loanRequest) {
  let score = 50; // Start neutral
  const reasons = [];

  // Factor 1: Repayment history
  if (agentProfile.totalLoans > 0) {
    if (agentProfile.onTimeRate >= 0.9) {
      score += 20;
      reasons.push('excellent repayment history');
    } else if (agentProfile.onTimeRate >= 0.7) {
      score += 10;
      reasons.push('good repayment history');
    } else if (agentProfile.onTimeRate < 0.5) {
      score -= 15;
      reasons.push('poor repayment history');
    }
  } else {
    reasons.push('no loan history (new agent)');
  }

  // Factor 2: Defaults
  if (agentProfile.totalDefaulted > 0) {
    score -= agentProfile.totalDefaulted * 10;
    reasons.push(`${agentProfile.totalDefaulted} previous default(s)`);
  }

  // Factor 3: Blacklist check
  if (agentProfile.isBlacklisted) {
    score = 0;
    reasons.push('agent is blacklisted');
  }

  // Factor 4: Loan amount relative to track record
  if (loanRequest.amount > 5000 && agentProfile.totalLoans < 3) {
    score -= 10;
    reasons.push('large loan request with limited history');
  }

  // Factor 5: Purpose evaluation (simple keyword check)
  const purpose = (loanRequest.purpose || '').toLowerCase();
  if (purpose.includes('revenue') || purpose.includes('service') || purpose.includes('fulfill')) {
    score += 5;
    reasons.push('revenue-generating purpose');
  }
  if (purpose.includes('gambl') || purpose.includes('specul')) {
    score -= 10;
    reasons.push('speculative purpose');
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: reasons.join('; ')
  };
}

module.exports = { getLLMScore };
