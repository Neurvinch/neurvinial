// ============================================
// SENTINEL — OpenClaw Agent Integration
// ============================================
// Functional integration with OpenClaw SDK and Groq LLM.
// Skills are loaded from markdown files and executed via LLM reasoning.
//
// Architecture:
//   - Skills defined in: agent/skills/*/SKILL.md
//   - LLM reasoning: Groq SDK for fast inference
//   - OpenClaw SDK: For agent utilities
//   - Functional composition: Pure functions, no classes

const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const logger = require('../config/logger');
const config = require('../config');

// ============================================
// Configuration
// ============================================
const SKILLS_PATH = path.join(__dirname, '../../agent/skills');
const CONFIG_PATH = path.join(__dirname, '../../agent/openclaw.json');

// Initialize Groq client for LLM reasoning
const groq = config.groq?.apiKey
  ? new Groq({ apiKey: config.groq.apiKey })
  : null;

// ============================================
// Pure Functions - Skill Loading
// ============================================

/**
 * Parse frontmatter from markdown content.
 * @param {string} content - Markdown content with YAML frontmatter
 * @returns {{ frontmatter: Object, body: string }}
 */
const parseFrontmatter = (content) => {
  const lines = content.split('\n');
  let inFrontmatter = false;
  const frontmatter = {};
  const bodyLines = [];

  for (const line of lines) {
    if (line.trim() === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }

    if (inFrontmatter) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        frontmatter[key] = value;
      }
    } else {
      bodyLines.push(line);
    }
  }

  return { frontmatter, body: bodyLines.join('\n').trim() };
};

/**
 * Load a skill from disk.
 * @param {string} skillName - Name of the skill directory
 * @returns {Object|null} Skill object or null if not found
 */
const loadSkill = (skillName) => {
  const skillDir = skillName.replace('sentinel_', '');
  const skillPath = path.join(SKILLS_PATH, skillDir, 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    logger.warn(`Skill file not found: ${skillPath}`);
    return null;
  }

  const content = fs.readFileSync(skillPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    name: skillName,
    path: skillPath,
    ...frontmatter,
    instructions: body
  };
};

/**
 * Load all enabled skills from config.
 * @returns {Map<string, Object>} Map of skill name to skill object
 */
const loadAllSkills = () => {
  const skills = new Map();

  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      logger.warn('OpenClaw config not found, using default skills');
      return skills;
    }

    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const entries = configData.skills?.entries || {};

    for (const [skillName, skillConfig] of Object.entries(entries)) {
      if (skillConfig.enabled) {
        const skill = loadSkill(skillName);
        if (skill) {
          skills.set(skillName, skill);
          logger.debug(`Loaded skill: ${skillName}`);
        }
      }
    }

    logger.info('Skills loaded', { count: skills.size, names: Array.from(skills.keys()) });
  } catch (error) {
    logger.error('Failed to load skills', { error: error.message });
  }

  return skills;
};

// ============================================
// Pure Functions - LLM Reasoning
// ============================================

// Credit tier limits for loan decisions
const TIER_LIMITS = {
  'A': 5000,
  'B': 2000,
  'C': 500,
  'D': 0
};

/**
 * Pre-compute lending decision to help LLM.
 * @param {Object} context - Execution context
 * @returns {Object} Enhanced context with decision hints
 */
const enhanceLendingContext = (context) => {
  const ctx = context.context || context;
  const { tier, creditScore, amount } = ctx;

  if (!tier && !creditScore && !amount) {
    return context;
  }

  // Derive tier from creditScore if not provided
  let derivedTier = tier;
  if (!derivedTier && creditScore !== undefined) {
    if (creditScore >= 80) derivedTier = 'A';
    else if (creditScore >= 60) derivedTier = 'B';
    else if (creditScore >= 40) derivedTier = 'C';
    else derivedTier = 'D';
  }

  if (!derivedTier) derivedTier = 'C'; // Default

  const limit = TIER_LIMITS[derivedTier] || 500;
  const amountNum = parseInt(amount) || 0;

  // Pre-compute the comparison
  const exceedsLimit = amountNum > limit;
  const isTierD = derivedTier === 'D';

  return {
    ...context,
    _lendingHint: {
      tier: derivedTier,
      limit: limit,
      amount: amountNum,
      exceedsLimit: exceedsLimit,
      isTierD: isTierD,
      shouldDeny: isTierD || exceedsLimit,
      recommendation: isTierD ? 'DENY (Tier D always denied)' :
                      exceedsLimit ? `DENY (${amountNum} > ${limit})` :
                      `APPROVE (${amountNum} <= ${limit})`
    }
  };
};

/**
 * Generate LLM prompt for skill execution.
 * @param {Object} skill - Skill definition
 * @param {Object} context - Execution context
 * @returns {string} Formatted prompt
 */
const buildSkillPrompt = (skill, context) => {
  // Add lending hints for lending skill
  let enhancedContext = context;
  if (skill.name === 'sentinel_lending') {
    enhancedContext = enhanceLendingContext(context);
  }

  let lendingHint = '';
  if (enhancedContext._lendingHint) {
    const h = enhancedContext._lendingHint;
    lendingHint = `
## PRE-COMPUTED DECISION (USE THIS!)
- Tier: ${h.tier}
- Limit: $${h.limit}
- Amount: $${h.amount}
- Exceeds Limit: ${h.exceedsLimit ? 'YES' : 'NO'}
- Is Tier D: ${h.isTierD ? 'YES' : 'NO'}
- **RECOMMENDATION: ${h.recommendation}**

IMPORTANT: Follow the recommendation above! If it says DENY, use action="deny_loan". If it says APPROVE, use action="approve_loan".
`;
  }

  return `
You are an AI agent executing the "${skill.name}" skill.

## Skill Instructions
${skill.instructions}
${lendingHint}
## Context
${JSON.stringify(enhancedContext, null, 2)}

## Task
Based on the skill instructions and context, provide a JSON response with:
1. "action": The recommended action to take
2. "reasoning": Brief explanation of your decision
3. "confidence": Score from 0-100
4. "data": Any relevant output data

Respond with valid JSON only.
`;
};

/**
 * Execute LLM reasoning for a skill.
 * @param {Object} skill - Skill definition
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} LLM response
 */
const executeLLMReasoning = async (skill, context) => {
  // SPECIAL HANDLING: For lending decisions with complete info, use deterministic logic
  if (skill.name === 'sentinel_lending') {
    const ctx = context.context || context;
    const { tier, creditScore, amount } = ctx;

    if ((tier || creditScore !== undefined) && amount !== undefined) {
      // Derive tier from creditScore if not provided
      let derivedTier = tier;
      if (!derivedTier && creditScore !== undefined) {
        if (creditScore >= 80) derivedTier = 'A';
        else if (creditScore >= 60) derivedTier = 'B';
        else if (creditScore >= 40) derivedTier = 'C';
        else derivedTier = 'D';
      }
      if (!derivedTier) derivedTier = 'C';

      const limit = TIER_LIMITS[derivedTier] || 500;
      const amountNum = parseInt(amount) || 0;
      const isTierD = derivedTier === 'D';
      const exceedsLimit = amountNum > limit;

      // Deterministic decision - no LLM needed!
      if (isTierD) {
        return {
          action: 'deny_loan',
          reasoning: `Tier D (score ${creditScore || 'N/A'}) - not eligible for loans. DENIED.`,
          confidence: 100,
          data: { tier: derivedTier, maxAllowed: 0, requested: amountNum },
          source: 'deterministic'
        };
      }

      if (exceedsLimit) {
        return {
          action: 'deny_loan',
          reasoning: `Tier ${derivedTier} credit. Amount $${amountNum} exceeds limit $${limit}. DENIED.`,
          confidence: 100,
          data: { tier: derivedTier, limit: limit, requested: amountNum },
          source: 'deterministic'
        };
      }

      return {
        action: 'approve_loan',
        reasoning: `Tier ${derivedTier} credit (score ${creditScore || 'N/A'}). Amount $${amountNum} within limit $${limit}. APPROVED.`,
        confidence: 100,
        data: { approvedAmount: amountNum, tier: derivedTier, interestRate: derivedTier === 'A' ? 0.035 : derivedTier === 'B' ? 0.05 : 0.08 },
        source: 'deterministic'
      };
    }
  }

  if (!groq) {
    // Fallback when Groq not configured
    return {
      action: 'proceed',
      reasoning: 'LLM not configured, using default behavior',
      confidence: 50,
      data: context,
      source: 'fallback'
    };
  }

  try {
    const prompt = buildSkillPrompt(skill, context);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a DeFi lending agent assistant. Respond only with valid JSON.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1024
    });

    const responseText = completion.choices[0]?.message?.content || '{}';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        ...JSON.parse(jsonMatch[0]),
        source: 'groq-llm'
      };
    }

    return {
      action: 'proceed',
      reasoning: responseText,
      confidence: 70,
      data: context,
      source: 'groq-llm-text'
    };
  } catch (error) {
    logger.error('LLM reasoning failed', { error: error.message, skill: skill.name });
    return {
      action: 'error',
      reasoning: `LLM error: ${error.message}`,
      confidence: 0,
      data: context,
      source: 'error'
    };
  }
};

// ============================================
// State Management (Functional)
// ============================================

// Skill cache (lazy loaded)
let skillsCache = null;

/**
 * Get or initialize skills cache.
 * @returns {Map<string, Object>}
 */
const getSkills = () => {
  if (!skillsCache) {
    skillsCache = loadAllSkills();
  }
  return skillsCache;
};

/**
 * Check if system is initialized.
 * @returns {boolean}
 */
const isInitialized = () => getSkills().size > 0;

// ============================================
// Public API - Functional Interface
// ============================================

/**
 * Initialize the OpenClaw agent system.
 * @returns {Promise<{ initialized: boolean, skillCount: number }>}
 */
const initialize = async () => {
  const skills = getSkills();
  logger.info('OpenClaw agent initialized', { skillCount: skills.size });
  return { initialized: true, skillCount: skills.size };
};

/**
 * Invoke a skill with context.
 * @param {string} skillName - Name of the skill to invoke
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Skill execution result
 */
const invokeSkill = async (skillName, context = {}) => {
  const skills = getSkills();
  const skill = skills.get(skillName);

  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  logger.info('Invoking skill', { skillName, contextKeys: Object.keys(context) });

  const llmResult = await executeLLMReasoning(skill, context);

  return {
    skill: skillName,
    description: skill.description || skill.name,
    result: llmResult,
    context,
    timestamp: new Date().toISOString()
  };
};

/**
 * Get list of available skills.
 * @returns {Array<{ name: string, description: string }>}
 */
const listSkills = () =>
  Array.from(getSkills().values()).map(skill => ({
    name: skill.name,
    description: skill.description || 'No description'
  }));

/**
 * Check if a skill exists.
 * @param {string} skillName
 * @returns {boolean}
 */
const hasSkill = (skillName) => getSkills().has(skillName);

/**
 * Reload all skills from disk.
 * @returns {Promise<{ reloaded: boolean, skillCount: number }>}
 */
const reloadSkills = async () => {
  skillsCache = null;
  const skills = getSkills();
  return { reloaded: true, skillCount: skills.size };
};

// ============================================
// Domain-Specific Functions
// ============================================

/**
 * Assess credit for an agent using LLM reasoning.
 * @param {Object} agentData - Agent profile data
 * @returns {Promise<Object>}
 */
const assessCredit = async (agentData) =>
  invokeSkill('sentinel_credit', {
    did: agentData.did,
    creditScore: agentData.creditScore,
    tier: agentData.tier,
    totalLoans: agentData.totalLoans,
    totalRepaid: agentData.totalRepaid,
    onTimeRate: agentData.onTimeRate,
    action: 'assess_creditworthiness'
  });

/**
 * Make a lending decision using LLM reasoning.
 * @param {Object} loanRequest - Loan request details
 * @returns {Promise<Object>}
 */
const makeLendingDecision = async (loanRequest) =>
  invokeSkill('sentinel_lending', {
    did: loanRequest.did,
    amount: loanRequest.amount,
    purpose: loanRequest.purpose,
    creditScore: loanRequest.creditScore,
    tier: loanRequest.tier,
    action: 'evaluate_loan_request',
    context: {
      creditScore: loanRequest.creditScore,
      tier: loanRequest.tier,
      amount: loanRequest.amount
    }
  });

/**
 * Initiate recovery process for overdue loan.
 * @param {Object} loan - Loan details
 * @returns {Promise<Object>}
 */
const initiateRecovery = async (loan) =>
  invokeSkill('sentinel_recovery', {
    loanId: loan.loanId,
    borrowerDid: loan.borrowerDid,
    amount: loan.totalDue,
    dueDate: loan.dueDate,
    status: loan.status,
    action: 'initiate_recovery'
  });

/**
 * Process bot commands intelligently with context awareness.
 * @param {Object} commandData - Command details
 * @returns {Promise<Object>}
 */
const processIntelligentCommand = async (commandData) =>
  invokeSkill('sentinel_bot_commands', {
    command: commandData.command,
    user: commandData.user,
    message: commandData.message,
    context: commandData.context,
    channel: commandData.channel,
    action: 'process_command'
  });

// ============================================
// Exports - Functional API
// ============================================
module.exports = {
  // Core functions
  initialize,
  invokeSkill,
  listSkills,
  hasSkill,
  reloadSkills,
  isInitialized,

  // Domain functions
  assessCredit,
  makeLendingDecision,
  initiateRecovery,
  processIntelligentCommand,

  // Utilities
  parseFrontmatter,
  loadSkill,
  buildSkillPrompt,

  // For backwards compatibility
  openClaw: {
    initialize,
    invokeSkill,
    getSkills: listSkills,
    hasSkill,
    reload: reloadSkills
  }
};
