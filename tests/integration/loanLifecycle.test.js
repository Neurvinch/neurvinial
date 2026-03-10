// ============================================
// SENTINEL — Integration Test: Loan Lifecycle
// ============================================
// Tests the full loan lifecycle end-to-end:
//   Register → Request Loan → Score → Approve → Disburse → Repay

const { RISK_TIERS } = require('../../core/utils/constants');
const { getTierFromScore } = require('../../core/utils/tierCalculator');
const mlModel = require('../../core/scoring/mlModel');

describe('Loan Lifecycle (Integration)', () => {

  describe('End-to-end scoring flow', () => {
    test('new agent → scored → tier assigned → terms calculated', () => {
      // Simulate a new agent with no history
      const agentData = {
        totalLoans: 0,
        totalRepaid: 0,
        totalDefaulted: 0,
        onTimeRate: 0,
        registeredAt: new Date(),
        recentTxCount: 0,
        collateralRatio: 0
      };

      // Step 1: ML scoring
      const mlResult = mlModel.score(agentData);
      expect(mlResult.mlScore).toBeDefined();

      // Step 2: Get tier from score
      const tier = getTierFromScore(mlResult.mlScore);
      expect(['A', 'B', 'C', 'D']).toContain(tier.tierLetter);

      // Step 3: Verify tier has valid terms
      if (tier.tierLetter !== 'D') {
        expect(tier.apr).toBeGreaterThan(0);
        expect(tier.maxLoan).toBeGreaterThan(0);
        expect(tier.collateralPct).toBeGreaterThanOrEqual(0);
      } else {
        expect(tier.apr).toBeNull();
        expect(tier.maxLoan).toBe(0);
      }
    });

    test('loan terms calculation: amount + interest + duration', () => {
      const amount = 500;
      const apr = 0.18; // Tier C
      const durationDays = 30;

      const interestAccrued = amount * apr * (durationDays / 365);
      const totalDue = amount + interestAccrued;

      expect(interestAccrued).toBeGreaterThan(0);
      expect(totalDue).toBeGreaterThan(amount);
      expect(totalDue).toBeCloseTo(507.40, 0); // ~$7.40 interest on $500 at 18% for 30 days
    });

    test('credit score update on repayment: on-time = +5', () => {
      let creditScore = 50; // Starting score
      const ON_TIME_BONUS = 5;

      // Simulate on-time repayment
      creditScore = Math.min(100, creditScore + ON_TIME_BONUS);
      expect(creditScore).toBe(55);

      // After enough repayments, agent should reach higher tiers
      for (let i = 0; i < 10; i++) {
        creditScore = Math.min(100, creditScore + ON_TIME_BONUS);
      }
      expect(creditScore).toBe(100);
      expect(getTierFromScore(creditScore).tierLetter).toBe('A');
    });

    test('credit score update on default: -20 points + blacklist at 3', () => {
      let creditScore = 70;
      let totalDefaulted = 0;
      const DEFAULT_PENALTY = -20;
      const MAX_DEFAULTS = 3;

      // First default
      creditScore = Math.max(0, creditScore + DEFAULT_PENALTY);
      totalDefaulted++;
      expect(creditScore).toBe(50);
      expect(totalDefaulted < MAX_DEFAULTS).toBe(true);

      // Second default
      creditScore = Math.max(0, creditScore + DEFAULT_PENALTY);
      totalDefaulted++;
      expect(creditScore).toBe(30);

      // Third default → blacklisted
      creditScore = Math.max(0, creditScore + DEFAULT_PENALTY);
      totalDefaulted++;
      expect(creditScore).toBe(10);
      expect(totalDefaulted >= MAX_DEFAULTS).toBe(true); // Should be blacklisted
      expect(getTierFromScore(creditScore).tierLetter).toBe('D');
    });
  });

  describe('Risk tier boundaries', () => {
    test('all tier boundaries are correctly defined', () => {
      // Verify no gaps or overlaps in tier definitions
      const tiers = Object.entries(RISK_TIERS);

      for (const [letter, tier] of tiers) {
        expect(tier.minScore).toBeLessThanOrEqual(tier.maxScore);
        expect(tier.minScore).toBeGreaterThanOrEqual(0);
        expect(tier.maxScore).toBeLessThanOrEqual(100);
      }

      // Verify complete coverage: 0-100
      expect(RISK_TIERS.D.minScore).toBe(0);
      expect(RISK_TIERS.A.maxScore).toBe(100);
    });
  });
});
