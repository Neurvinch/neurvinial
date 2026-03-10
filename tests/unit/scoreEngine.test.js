// ============================================
// SENTINEL — Unit Tests: ML Model
// ============================================

const mlModel = require('../../core/scoring/mlModel');

describe('CreditMLModel', () => {
  describe('sigmoid', () => {
    test('sigmoid(0) = 0.5', () => {
      expect(mlModel.sigmoid(0)).toBeCloseTo(0.5, 5);
    });

    test('sigmoid(large positive) ≈ 1', () => {
      expect(mlModel.sigmoid(10)).toBeCloseTo(1, 3);
    });

    test('sigmoid(large negative) ≈ 0', () => {
      expect(mlModel.sigmoid(-10)).toBeCloseTo(0, 3);
    });
  });

  describe('defaultProbToScore', () => {
    test('0% default probability → score 100', () => {
      expect(mlModel.defaultProbToScore(0)).toBe(100);
    });

    test('100% default probability → score 0', () => {
      expect(mlModel.defaultProbToScore(1)).toBe(0);
    });

    test('50% default probability → score 50', () => {
      expect(mlModel.defaultProbToScore(0.5)).toBe(50);
    });
  });

  describe('score', () => {
    test('excellent borrower gets high score', () => {
      const result = mlModel.score({
        totalLoans: 10,
        totalRepaid: 10,
        totalDefaulted: 0,
        onTimeRate: 1.0,
        registeredAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year old
        recentTxCount: 50,
        collateralRatio: 0.5
      });

      expect(result.mlScore).toBeGreaterThan(60);
      expect(result.defaultProbability).toBeLessThan(0.4);
    });

    test('new agent with no history gets a conservative (low) score', () => {
      const result = mlModel.score({
        totalLoans: 0,
        totalRepaid: 0,
        totalDefaulted: 0,
        onTimeRate: 0,
        registeredAt: new Date(),
        recentTxCount: 0,
        collateralRatio: 0
      });

      // New agents with zero history are high-risk to the ML model.
      // This is correct — they start at Tier C/D from ML perspective.
      // The LLM scorer (40% weight) will balance this out in production.
      expect(result.mlScore).toBeLessThanOrEqual(50);
      expect(result.defaultProbability).toBeGreaterThan(0.5);
    });

    test('serial defaulter gets low score', () => {
      const result = mlModel.score({
        totalLoans: 5,
        totalRepaid: 1,
        totalDefaulted: 4,
        onTimeRate: 0.2,
        registeredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days old
        recentTxCount: 2,
        collateralRatio: 0
      });

      expect(result.mlScore).toBeLessThan(60);
      expect(result.defaultProbability).toBeGreaterThan(0.3);
    });

    test('result contains all expected fields', () => {
      const result = mlModel.score({
        totalLoans: 3,
        totalRepaid: 2,
        totalDefaulted: 1,
        onTimeRate: 0.67,
        registeredAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        recentTxCount: 10,
        collateralRatio: 0.25
      });

      expect(result).toHaveProperty('mlScore');
      expect(result).toHaveProperty('defaultProbability');
      expect(result).toHaveProperty('features');
      expect(result).toHaveProperty('featureWeights');
      expect(typeof result.mlScore).toBe('number');
      expect(result.mlScore).toBeGreaterThanOrEqual(0);
      expect(result.mlScore).toBeLessThanOrEqual(100);
    });
  });
});
