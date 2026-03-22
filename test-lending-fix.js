// ============================================
// Quick Lending Logic Test
// ============================================
// Test the fixed lending decision logic

const { makeLendingDecision } = require('./core/agent/openclawIntegration');

async function testLendingFix() {
  console.log('🧪 Testing Fixed Lending Logic...\n');

  const tests = [
    { name: 'Tier A - Valid ($3000 <= $5000)', data: { did: 'test1', amount: 3000, creditScore: 85, tier: 'A' }, expect: 'approve_loan' },
    { name: 'Tier A - Invalid ($6000 > $5000)', data: { did: 'test2', amount: 6000, creditScore: 85, tier: 'A' }, expect: 'deny_loan' },
    { name: 'Tier B - Valid ($1500 <= $2000)', data: { did: 'test3', amount: 1500, creditScore: 75, tier: 'B' }, expect: 'approve_loan' },
    { name: 'Tier B - Invalid ($2500 > $2000)', data: { did: 'test4', amount: 2500, creditScore: 75, tier: 'B' }, expect: 'deny_loan' },
    { name: 'Tier C - Valid ($400 <= $500)', data: { did: 'test5', amount: 400, creditScore: 55, tier: 'C' }, expect: 'approve_loan' },
    { name: 'Tier D - Always Deny', data: { did: 'test6', amount: 100, creditScore: 25, tier: 'D' }, expect: 'deny_loan' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      const result = await makeLendingDecision(test.data);

      if (result.result.action === test.expect) {
        console.log(`✅ PASS - ${result.result.action} (${result.result.source || 'unknown'})`);
        console.log(`   Reasoning: ${result.result.reasoning}`);
        passed++;
      } else {
        console.log(`❌ FAIL - Expected: ${test.expect}, Got: ${result.result.action}`);
        console.log(`   Reasoning: ${result.result.reasoning}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      failed++;
    }
    console.log('');
  }

  console.log(`📊 Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 ALL LENDING TESTS PASS! Logic is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the deterministic logic.');
  }
}

testLendingFix().catch(console.error);