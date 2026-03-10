// ============================================
// SENTINEL — Unit Tests: Tier Calculator
// ============================================

const { getTierFromScore } = require('../../core/utils/tierCalculator');

describe('getTierFromScore', () => {
  // Tier A: 80-100
  test('score 100 → Tier A (Prime)', () => {
    const result = getTierFromScore(100);
    expect(result.tierLetter).toBe('A');
    expect(result.label).toBe('Prime');
    expect(result.apr).toBe(0.04);
    expect(result.maxLoan).toBe(10000);
    expect(result.collateralPct).toBe(0);
  });

  test('score 85 → Tier A (Prime)', () => {
    const result = getTierFromScore(85);
    expect(result.tierLetter).toBe('A');
  });

  test('score 80 → Tier A (boundary)', () => {
    const result = getTierFromScore(80);
    expect(result.tierLetter).toBe('A');
  });

  // Tier B: 60-79
  test('score 79 → Tier B (Standard)', () => {
    const result = getTierFromScore(79);
    expect(result.tierLetter).toBe('B');
    expect(result.label).toBe('Standard');
    expect(result.apr).toBe(0.09);
    expect(result.maxLoan).toBe(3000);
    expect(result.collateralPct).toBe(0.25);
  });

  test('score 70 → Tier B', () => {
    const result = getTierFromScore(70);
    expect(result.tierLetter).toBe('B');
  });

  test('score 60 → Tier B (boundary)', () => {
    const result = getTierFromScore(60);
    expect(result.tierLetter).toBe('B');
  });

  // Tier C: 40-59
  test('score 59 → Tier C (Subprime)', () => {
    const result = getTierFromScore(59);
    expect(result.tierLetter).toBe('C');
    expect(result.label).toBe('Subprime');
    expect(result.apr).toBe(0.18);
    expect(result.maxLoan).toBe(500);
    expect(result.collateralPct).toBe(0.50);
  });

  test('score 50 → Tier C', () => {
    const result = getTierFromScore(50);
    expect(result.tierLetter).toBe('C');
  });

  test('score 40 → Tier C (boundary)', () => {
    const result = getTierFromScore(40);
    expect(result.tierLetter).toBe('C');
  });

  // Tier D: 0-39
  test('score 39 → Tier D (Denied)', () => {
    const result = getTierFromScore(39);
    expect(result.tierLetter).toBe('D');
    expect(result.label).toBe('Denied');
    expect(result.apr).toBeNull();
    expect(result.maxLoan).toBe(0);
    expect(result.collateralPct).toBeNull();
  });

  test('score 20 → Tier D', () => {
    const result = getTierFromScore(20);
    expect(result.tierLetter).toBe('D');
  });

  test('score 0 → Tier D', () => {
    const result = getTierFromScore(0);
    expect(result.tierLetter).toBe('D');
  });

  // Edge cases
  test('score above 100 is clamped to 100 → Tier A', () => {
    const result = getTierFromScore(150);
    expect(result.tierLetter).toBe('A');
  });

  test('negative score is clamped to 0 → Tier D', () => {
    const result = getTierFromScore(-10);
    expect(result.tierLetter).toBe('D');
  });

  test('decimal score 85.7 is rounded to 86 → Tier A', () => {
    const result = getTierFromScore(85.7);
    expect(result.tierLetter).toBe('A');
  });
});
