// ============================================
// SENTINEL — OpenClaw Integration Module
// ============================================
// Integrates OpenClaw agent skills with Sentinel's loan processing.
// OpenClaw reads skill markdown files and executes autonomous decisions.
//
// Architecture:
//   - Skills defined in: agent/skills/*/SKILL.md
//   - Configuration: agent/openclaw.json
//   - Runtime: This module bridges Node.js ↔ OpenClaw
//
// Note: This is a bridge implementation. In production, OpenClaw
// runs as a separate process. Here we simulate the behavior for
// the hackathon demo.

const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const config = require('../config');

// ============================================
// OpenClaw Skill Loader
// ============================================
class OpenClawRuntime {
  constructor() {
    this.skills = new Map();
    this.skillsPath = path.join(__dirname, '../../agent/skills');
    this.configPath = path.join(__dirname, '../../agent/openclaw.json');
    this.initialized = false;
  }

  /**
   * Initialize OpenClaw runtime and load all skills.
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load OpenClaw configuration
      const configData = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);

      // Load all enabled skills
      for (const [skillName, skillConfig] of Object.entries(this.config.skills.entries)) {
        if (skillConfig.enabled) {
          await this.loadSkill(skillName);
        }
      }

      this.initialized = true;
      logger.info('OpenClaw runtime initialized', {
        skillCount: this.skills.size,
        skills: Array.from(this.skills.keys())
      });
    } catch (error) {
      logger.error('OpenClaw initialization failed', { error: error.message });
      // Don't throw - graceful degradation
      this.initialized = false;
    }
  }

  /**
   * Load a skill from markdown file.
   */
  async loadSkill(skillName) {
    try {
      // Map skill name to directory (strip sentinel_ prefix)
      const skillDir = skillName.replace('sentinel_', '');
      const skillPath = path.join(this.skillsPath, skillDir, 'SKILL.md');

      if (!fs.existsSync(skillPath)) {
        logger.warn(`Skill file not found: ${skillPath}`);
        return;
      }

      const skillContent = fs.readFileSync(skillPath, 'utf8');

      // Parse frontmatter and content
      const skill = this.parseSkillMarkdown(skillContent);
      skill.name = skillName;
      skill.path = skillPath;

      this.skills.set(skillName, skill);

      logger.debug(`Loaded OpenClaw skill: ${skillName}`, {
        description: skill.description
      });
    } catch (error) {
      logger.error(`Failed to load skill: ${skillName}`, { error: error.message });
    }
  }

  /**
   * Parse skill markdown file (frontmatter + content).
   */
  parseSkillMarkdown(content) {
    const lines = content.split('\n');
    let inFrontmatter = false;
    let frontmatter = {};
    let markdownContent = [];

    for (const line of lines) {
      if (line.trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
          continue;
        } else {
          inFrontmatter = false;
          continue;
        }
      }

      if (inFrontmatter) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          frontmatter[key.trim()] = valueParts.join(':').trim();
        }
      } else {
        markdownContent.push(line);
      }
    }

    return {
      ...frontmatter,
      content: markdownContent.join('\n').trim()
    };
  }

  /**
   * Invoke a skill with context.
   * This simulates OpenClaw's agent reasoning.
   */
  async invokeSkill(skillName, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const skill = this.skills.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    logger.info(`Invoking OpenClaw skill: ${skillName}`, { context });

    // In a real OpenClaw implementation, this would:
    // 1. Parse the skill markdown
    // 2. Use an LLM to reason about the task
    // 3. Execute tool calls defined in the skill
    // 4. Return the result
    //
    // For the hackathon, we return skill metadata and instructions
    return {
      skill: skillName,
      description: skill.description,
      instructions: skill.content,
      context,
      invoked: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get all loaded skills.
   */
  getSkills() {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.name,
      description: skill.description
    }));
  }

  /**
   * Check if a skill is available.
   */
  hasSkill(skillName) {
    return this.skills.has(skillName);
  }

  /**
   * Reload skills from disk.
   */
  async reload() {
    this.skills.clear();
    this.initialized = false;
    await this.initialize();
  }
}

// ============================================
// Singleton instance
// ============================================
const openClaw = new OpenClawRuntime();

// ============================================
// Convenience functions for common workflows
// ============================================

/**
 * Invoke credit assessment skill.
 * Used before making loan decisions.
 */
async function assessCredit(agentData) {
  return openClaw.invokeSkill('sentinel_credit', {
    did: agentData.did,
    creditScore: agentData.creditScore,
    tier: agentData.tier,
    totalLoans: agentData.totalLoans,
    totalRepaid: agentData.totalRepaid,
    onTimeRate: agentData.onTimeRate
  });
}

/**
 * Invoke lending decision skill.
 * Used to approve/deny loan requests.
 */
async function makeLendingDecision(loanRequest) {
  return openClaw.invokeSkill('sentinel_lending', {
    did: loanRequest.did,
    amount: loanRequest.amount,
    purpose: loanRequest.purpose
  });
}

/**
 * Invoke recovery skill.
 * Used when loans become overdue.
 */
async function initiateRecovery(loan) {
  return openClaw.invokeSkill('sentinel_recovery', {
    loanId: loan.loanId,
    borrowerDid: loan.borrowerDid,
    amount: loan.totalDue,
    dueDate: loan.dueDate,
    status: loan.status
  });
}

// ============================================
// Export
// ============================================
module.exports = {
  openClaw,
  assessCredit,
  makeLendingDecision,
  initiateRecovery,

  // For testing
  OpenClawRuntime
};
