// ============================================
// SENTINEL - Automated User Simulation
// ============================================
// Simulates real human users testing the lending system
// Creates multiple personas and runs realistic scenarios

const axios = require('axios');
const colors = require('colors');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = 'sentinel_demo_key_2026';

// User Personas
const users = [
  {
    name: 'Alice',
    profile: 'Small Business Owner',
    did: 'did:test:alice',
    tier: 'B',
    score: 75,
    requests: [
      { amount: 1500, shouldApprove: true, reason: 'Within $2,000 limit' },
      { amount: 2500, shouldApprove: false, reason: 'Exceeds $2,000 limit' }
    ]
  },
  {
    name: 'Bob',
    profile: 'Freelance Developer',
    did: 'did:test:bob',
    tier: 'C',
    score: 50,
    requests: [
      { amount: 400, shouldApprove: true, reason: 'Within $500 limit' },
      { amount: 600, shouldApprove: false, reason: 'Exceeds $500 limit' },
      { amount: 50, shouldApprove: true, reason: 'Small safe amount' }
    ]
  },
  {
    name: 'Charlie',
    profile: 'College Student',
    did: 'did:test:charlie',
    tier: 'D',
    score: 30,
    requests: [
      { amount: 200, shouldApprove: false, reason: 'Tier D not eligible' },
      { amount: 50, shouldApprove: false, reason: 'Tier D - any amount denied' }
    ]
  },
  {
    name: 'Diana',
    profile: 'Established Agent',
    did: 'did:test:diana',
    tier: 'A',
    score: 95,
    requests: [
      { amount: 4000, shouldApprove: true, reason: 'Within $5,000 limit' },
      { amount: 6000, shouldApprove: false, reason: 'Exceeds $5,000 limit' }
    ]
  },
  {
    name: 'Eve',
    profile: 'Risky Borrower',
    did: 'did:test:eve',
    tier: 'D',
    score: 20,
    requests: [
      { amount: 100, shouldApprove: false, reason: 'Tier D protection' }
    ]
  },
  {
    name: 'Frank',
    profile: 'First Timer',
    did: 'did:test:frank',
    tier: 'C',
    score: 50,
    requests: [
      { amount: 50, shouldApprove: true, reason: 'Building credit' },
      { amount: 100, shouldApprove: true, reason: 'Second small loan' }
    ]
  }
];

// Test results storage
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  userFeedback: []
};

// Helper: Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: API call with retry
const callAPI = async (endpoint, data, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(`${API_URL}${endpoint}`, data, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`      ⏳ Retry ${i + 1}/${retries}...`.gray);
      await sleep(1000);
    }
  }
};

// Test: Credit Assessment
const testCreditAssessment = async (user) => {
  console.log(`\n  📊 Testing credit assessment for ${user.name}...`.cyan);

  try {
    const response = await callAPI('/agent/invoke/sentinel_credit', {
      context: {
        did: user.did,
        action: 'assess_creditworthiness'
      }
    });

    if (response.success) {
      console.log(`    ✅ Credit assessment successful`.green);
      console.log(`       Reasoning: ${response.data.result.reasoning}`.gray);
      return true;
    } else {
      console.log(`    ❌ Credit assessment failed`.red);
      results.errors.push({
        user: user.name,
        test: 'credit_assessment',
        error: 'API returned success: false'
      });
      return false;
    }
  } catch (error) {
    console.log(`    ❌ Error: ${error.message}`.red);
    results.errors.push({
      user: user.name,
      test: 'credit_assessment',
      error: error.message
    });
    return false;
  }
};

// Test: Loan Request
const testLoanRequest = async (user, request) => {
  console.log(`\n  💰 Testing loan request: $${request.amount}`.cyan);
  console.log(`     Expected: ${request.shouldApprove ? 'APPROVE' : 'DENY'} - ${request.reason}`.gray);

  results.total++;

  try {
    const response = await callAPI('/agent/invoke/sentinel_lending', {
      context: {
        did: user.did,
        amount: request.amount,
        creditScore: user.score,
        tier: user.tier,
        action: 'evaluate_loan_request'
      }
    });

    if (!response.success) {
      console.log(`    ❌ FAIL: API returned error`.red);
      results.failed++;
      results.errors.push({
        user: user.name,
        test: `loan_request_${request.amount}`,
        error: 'API returned success: false'
      });
      return false;
    }

    const actualAction = response.data.result.action;
    const expectedAction = request.shouldApprove ? 'approve_loan' : 'deny_loan';

    if (actualAction === expectedAction) {
      console.log(`    ✅ PASS: Got "${actualAction}"`.green);
      console.log(`       Reasoning: ${response.data.result.reasoning}`.gray);
      console.log(`       Confidence: ${response.data.result.confidence}%`.gray);
      results.passed++;
      return true;
    } else {
      console.log(`    ❌ FAIL: Expected "${expectedAction}" but got "${actualAction}"`.red);
      console.log(`       Reasoning: ${response.data.result.reasoning}`.gray);
      results.failed++;
      results.errors.push({
        user: user.name,
        test: `loan_request_${request.amount}`,
        expected: expectedAction,
        actual: actualAction,
        reasoning: response.data.result.reasoning
      });
      return false;
    }
  } catch (error) {
    console.log(`    ❌ FAIL: ${error.message}`.red);
    results.failed++;
    results.errors.push({
      user: user.name,
      test: `loan_request_${request.amount}`,
      error: error.message
    });
    return false;
  }
};

// Simulate user feedback
const collectUserFeedback = (user, testResults) => {
  const avgScore = testResults.filter(r => r).length / testResults.length;
  const stars = Math.round(avgScore * 5);

  const feedback = {
    user: user.name,
    profile: user.profile,
    registrationStars: 5,
    clarityStars: stars >= 4 ? 5 : stars === 3 ? 4 : 3,
    processStars: stars >= 4 ? 5 : stars === 3 ? 4 : 3,
    responseStars: stars >= 4 ? 5 : 4,
    overallStars: stars,
    comments: stars >= 4
      ? 'Great experience! The system is fast and decisions make sense.'
      : stars === 3
      ? 'Good but had some issues. Explanations could be clearer.'
      : 'Confusing experience, decisions seem inconsistent.',
    issues: testResults.some(r => !r)
      ? 'Some loan decisions were unexpected or incorrect.'
      : 'No major issues, everything worked as expected.',
    suggestions: stars >= 4
      ? 'Add more detailed credit building tips.'
      : 'Improve error messages and make tier limits clearer.'
  };

  results.userFeedback.push(feedback);
  return feedback;
};

// Test single user
const testUser = async (user) => {
  console.log(`\n${'='.repeat(60)}`.yellow);
  console.log(`👤 Testing User: ${user.name} (${user.profile})`.yellow.bold);
  console.log(`   Tier: ${user.tier} | Score: ${user.score}`.yellow);
  console.log(`${'='.repeat(60)}`.yellow);

  // Test credit assessment
  await testCreditAssessment(user);
  await sleep(500);

  // Test loan requests
  const testResults = [];
  for (const request of user.requests) {
    const result = await testLoanRequest(user, request);
    testResults.push(result);
    await sleep(500);
  }

  // Collect feedback
  const feedback = collectUserFeedback(user, testResults);
  console.log(`\n  📝 User Feedback:`.magenta);
  console.log(`     Overall: ${'⭐'.repeat(feedback.overallStars)} (${feedback.overallStars}/5)`.magenta);
  console.log(`     Comments: "${feedback.comments}"`.gray);

  await sleep(1000);
};

// Print summary
const printSummary = () => {
  console.log(`\n\n${'='.repeat(60)}`.cyan);
  console.log(`📊 TEST SUMMARY`.cyan.bold);
  console.log(`${'='.repeat(60)}`.cyan);

  console.log(`\nTest Results:`);
  console.log(`  Total Tests: ${results.total}`.white);
  console.log(`  Passed: ${results.passed}`.green);
  console.log(`  Failed: ${results.failed}`.red);
  console.log(`  Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`.yellow);

  if (results.errors.length > 0) {
    console.log(`\n❌ Errors Found (${results.errors.length}):`);
    results.errors.forEach((err, i) => {
      console.log(`\n  ${i + 1}. User: ${err.user}`.red);
      console.log(`     Test: ${err.test}`.red);
      if (err.expected) {
        console.log(`     Expected: ${err.expected}`.gray);
        console.log(`     Actual: ${err.actual}`.gray);
        console.log(`     Reasoning: ${err.reasoning}`.gray);
      } else {
        console.log(`     Error: ${err.error}`.gray);
      }
    });
  }

  console.log(`\n\n📝 User Feedback Summary:`.magenta.bold);
  const avgStars = results.userFeedback.reduce((sum, f) => sum + f.overallStars, 0) / results.userFeedback.length;
  console.log(`  Average Rating: ${'⭐'.repeat(Math.round(avgStars))} (${avgStars.toFixed(1)}/5)`.magenta);

  results.userFeedback.forEach(feedback => {
    console.log(`\n  ${feedback.user} (${feedback.profile}):`);
    console.log(`    Overall: ${'⭐'.repeat(feedback.overallStars)} (${feedback.overallStars}/5)`);
    console.log(`    Comments: "${feedback.comments}"`);
  });

  console.log(`\n${'='.repeat(60)}`.cyan);

  if (results.failed === 0) {
    console.log(`\n✅ ALL TESTS PASSED! System is production-ready! 🎉`.green.bold);
  } else {
    console.log(`\n⚠️  SOME TESTS FAILED. Review errors above and fix issues.`.red.bold);
  }
  console.log(``);
};

// Main execution
const main = async () => {
  console.log(`\n${'='.repeat(60)}`.rainbow);
  console.log(`🎭 SENTINEL - Realistic User Testing`.rainbow.bold);
  console.log(`${'='.repeat(60)}`.rainbow);
  console.log(`\nAPI URL: ${API_URL}`.white);
  console.log(`Testing ${users.length} user personas...`.white);
  console.log(`\nStarting tests in 3 seconds...\n`.gray);
  await sleep(3000);

  // Test each user
  for (const user of users) {
    await testUser(user);
  }

  // Print summary
  printSummary();

  // Exit with appropriate code
  process.exit(results.failed === 0 ? 0 : 1);
};

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`\n❌ Fatal error: ${error.message}`.red.bold);
    process.exit(1);
  });
}

module.exports = { testUser, collectUserFeedback, results };
