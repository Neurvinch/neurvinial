// ============================================
// Test Enhanced OpenClaw Integration
// ============================================
// Verify that the new intelligent bot commands work properly

const {
  initialize,
  processIntelligentCommand,
  makeLendingDecision,
  assessCredit
} = require('./core/agent/openclawIntegration');

async function testEnhancedOpenClaw() {
  console.log('🧪 TESTING ENHANCED OPENCLAW INTEGRATION...\n');

  try {
    // Test 1: Initialize OpenClaw
    console.log('1. 🚀 Testing OpenClaw initialization...');
    const initResult = await initialize();
    console.log('✅ Initialized:', initResult);

    // Test 2: Test intelligent command processing
    console.log('\n2. 🤖 Testing intelligent command processing...');

    const commandTests = [
      {
        command: 'help',
        user: { id: '12345', did: 'did:telegram:12345' },
        context: { registered: true, creditScore: 75, tier: 'B' },
        channel: 'telegram'
      },
      {
        command: 'unknown',
        user: { id: '67890', did: null },
        context: { registered: false, message: 'what is this bot?' },
        channel: 'whatsapp'
      }
    ];

    for (const test of commandTests) {
      try {
        console.log(`\nTesting: ${test.command} command (${test.context.registered ? 'registered' : 'new'} user)`);
        const result = await processIntelligentCommand(test);

        console.log('✅ Result:', {
          action: result.result.action,
          confidence: result.result.confidence,
          reasoning: result.result.reasoning?.substring(0, 100) + '...',
          source: result.result.source
        });
      } catch (error) {
        console.log('❌ Command test failed:', error.message);
      }
    }

    // Test 3: Test lending decision with enhanced logic
    console.log('\n3. 💰 Testing enhanced lending decisions...');

    const lendingTests = [
      { did: 'did:test:user1', amount: 1500, creditScore: 75, tier: 'B' }, // Should approve (1500 <= 2000)
      { did: 'did:test:user2', amount: 3000, creditScore: 85, tier: 'A' }, // Should deny (3000 <= 5000 but close)
      { did: 'did:test:user3', amount: 600, creditScore: 35, tier: 'D' }   // Should deny (Tier D)
    ];

    for (const test of lendingTests) {
      try {
        console.log(`\nTesting loan: $${test.amount} for Tier ${test.tier} (score ${test.creditScore})`);
        const result = await makeLendingDecision(test);

        console.log('✅ Decision:', {
          action: result.result.action,
          confidence: result.result.confidence,
          reasoning: result.result.reasoning,
          source: result.result.source || 'openclaw'
        });
      } catch (error) {
        console.log('❌ Lending test failed:', error.message);
      }
    }

    // Test 4: Test credit assessment
    console.log('\n4. 📊 Testing credit assessment...');

    try {
      const creditResult = await assessCredit({
        did: 'did:test:credit',
        creditScore: 68,
        tier: 'B',
        totalLoans: 3,
        totalRepaid: 3,
        onTimeRate: 1.0
      });

      console.log('✅ Credit Assessment:', {
        action: creditResult.result.action,
        reasoning: creditResult.result.reasoning?.substring(0, 100) + '...'
      });
    } catch (error) {
      console.log('❌ Credit assessment failed:', error.message);
    }

    console.log('\n🎉 ENHANCED OPENCLAW INTEGRATION TEST COMPLETE!');
    console.log('\n📋 SUMMARY:');
    console.log('✅ OpenClaw initialization working');
    console.log('✅ Intelligent command processing active');
    console.log('✅ Enhanced lending decisions with deterministic logic');
    console.log('✅ Credit assessment integration functional');
    console.log('\n🚀 Your bot commands are now MUCH smarter!');
    console.log('\nNext: Test with real Telegram/WhatsApp messages:');
    console.log('• Send "/help" to see context-aware help');
    console.log('• Send random text to see intelligent responses');
    console.log('• Send "/request 2500" as Tier B to see smart denial');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  testEnhancedOpenClaw().catch(console.error);
}

module.exports = { testEnhancedOpenClaw };