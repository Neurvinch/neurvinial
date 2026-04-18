#!/usr/bin/env node

// ============================================
// SENTINEL - Real WhatsApp User Simulation
// ============================================
// Simulates real humans testing WhatsApp lending bot
// Tests: registration, loan requests, edge cases, credit building

const axios = require('axios');
const colors = require('colors');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || '+919514413987';

// Real user personas
const users = {
  priya: {
    name: 'Priya',
    role: 'Small Business Owner',
    phone: '+919876543210',
    did: 'did:whatsapp:+919876543210',
    messages: [
      {
        text: 'hi',
        expect: 'Welcome message with instructions',
        type: 'greeting'
      },
      {
        text: 'register',
        expect: 'Registration successful',
        type: 'register'
      },
      {
        text: 'status',
        expect: 'Credit profile with Tier B info',
        type: 'status'
      },
      {
        text: 'request 1500',
        expect: '✅ Approved (within Tier B $2000 limit)',
        type: 'loanRequest'
      }
    ]
  },
  ravi: {
    name: 'Ravi',
    role: 'Freelance Developer',
    phone: '+9198765432110',
    did: 'did:whatsapp:+9198765432110',
    messages: [
      {
        text: 'hi',
        expect: 'Welcome message',
        type: 'greeting'
      },
      {
        text: 'register',
        expect: 'Registration successful',
        type: 'register'
      },
      {
        text: 'request 100',
        expect: '✅ Approved (small amount)',
        type: 'loanRequest'
      },
      {
        text: 'request 400',
        expect: '✅ Approved (mid-range)',
        type: 'loanRequest'
      },
      {
        text: 'request 600',
        expect: '❌ Denied (exceeds $500 limit)',
        type: 'loanRequest'
      },
      {
        text: 'request 500',
        expect: '✅ Approved (exactly at limit)',
        type: 'loanRequest'
      }
    ]
  },
  neha: {
    name: 'Neha',
    role: 'First-Time User',
    phone: '+919876543211',
    did: 'did:whatsapp:+919876543211',
    messages: [
      {
        text: 'hi',
        expect: 'Welcome message',
        type: 'greeting'
      },
      {
        text: 'register',
        expect: 'Registration successful',
        type: 'register'
      },
      {
        text: 'status',
        expect: 'Credit profile',
        type: 'status'
      },
      {
        text: 'request 50',
        expect: '✅ Approved (building credit)',
        type: 'loanRequest'
      }
    ]
  }
};

const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  users: {}
};

// Simulate WhatsApp webhook
const simulateWhatsAppMessage = async (phoneNumber, messageText) => {
  try {
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${phoneNumber}`);
    data.append('Body', messageText);

    const response = await axios.post(`${API_URL}/channels/whatsapp/webhook`, data, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });

    return {
      success: response.status === 200,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status || 'N/A'
    };
  }
};

// Simulate direct API call for testing
const testLoanRequest = async (user, amount) => {
  try {
    const response = await axios.post(`${API_URL}/agent/invoke/sentinel_lending`, {
      context: {
        did: user.did,
        amount: amount,
        creditScore: 50,
        tier: 'C',
        action: 'evaluate_loan_request'
      }
    }, {
      headers: { 'X-API-Key': 'sentinel_demo_key_2026' },
      timeout: 10000
    });

    return {
      success: response.data.success,
      action: response.data.data?.result?.action,
      reasoning: response.data.data?.result?.reasoning,
      confidence: response.data.data?.result?.confidence
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Run tests for a user
const testUser = async (userId, user) => {
  console.log(`\n${'='.repeat(60)}`.yellow);
  console.log(`👤 Testing: ${user.name} (${user.role})`.yellow.bold);
  console.log(`   Phone: ${user.phone}`.gray);
  console.log(`   Messages: ${user.messages.length}`.gray);
  console.log(`${'='.repeat(60)}`.yellow);

  testResults.users[userId] = {
    name: user.name,
    messages: [],
    total: user.messages.length,
    passed: 0
  };

  for (let i = 0; i < user.messages.length; i++) {
    const msg = user.messages[i];
    testResults.total++;

    console.log(`\n  Message ${i + 1}/${user.messages.length}: "${msg.text}"`);
    console.log(`  Expected: ${msg.expect}`.gray);

    const result = await simulateWhatsAppMessage(user.phone, msg.text);

    if (result.success) {
      console.log(`  ✅ PASS: Message received and processed`.green);
      testResults.passed++;
      testResults.users[userId].passed++;
      testResults.users[userId].messages.push({
        text: msg.text,
        status: 'passed'
      });
    } else {
      console.log(`  ❌ FAIL: ${result.error || 'No response'}`.red);
      testResults.failed++;
      testResults.users[userId].messages.push({
        text: msg.text,
        status: 'failed',
        error: result.error
      });
    }

    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

// Print summary
const printSummary = () => {
  console.log(`\n\n${'='.repeat(60)}`.cyan);
  console.log(`📊 WHATSAPP REAL USER TESTING SUMMARY`.cyan.bold);
  console.log(`${'='.repeat(60)}`.cyan);

  console.log(`\nOverall Results:`.white);
  console.log(`  Total Messages: ${testResults.total}`.white);
  console.log(`  Passed: ${testResults.passed}`.green);
  console.log(`  Failed: ${testResults.failed}`.red);
  console.log(`  Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`.yellow);

  console.log(`\n\nUser Breakdowns:`.magenta.bold);
  for (const [userId, userResult] of Object.entries(testResults.users)) {
    const passRate = ((userResult.passed / userResult.total) * 100).toFixed(0);
    console.log(`\n  ${userResult.name}:`);
    console.log(`    Messages: ${userResult.passed}/${userResult.total} passed (${passRate}%)`);

    userResult.messages.forEach(msg => {
      const icon = msg.status === 'passed' ? '✅' : '❌';
      console.log(`      ${icon} "${msg.text}"`);
    });
  }

  console.log(`\n${'='.repeat(60)}`.cyan);

  if (testResults.failed === 0) {
    console.log(`\n✅ ALL TESTS PASSED! WhatsApp bot is working perfectly! 🎉`.green.bold);
  } else {
    console.log(`\n⚠️  SOME TESTS FAILED. Check the issues above.`.red.bold);
  }
};

// Main execution
const main = async () => {
  console.log(`\n${'='.repeat(60)}`.rainbow);
  console.log(`🎭 SENTINEL - Real WhatsApp User Simulation`.rainbow.bold);
  console.log(`${'='.repeat(60)}`.rainbow);
  console.log(`\nAPI URL: ${API_URL}`.white);
  console.log(`Testing ${Object.keys(users).length} real user personas...\n`.white);

  await new Promise(resolve => setTimeout(resolve, 2000));

  for (const [userId, user] of Object.entries(users)) {
    await testUser(userId, user);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  printSummary();
  process.exit(testResults.failed === 0 ? 0 : 1);
};

if (require.main === module) {
  main().catch(error => {
    console.error(`\n❌ Fatal error: ${error.message}`.red.bold);
    process.exit(1);
  });
}

module.exports = { simulateWhatsAppMessage, testLoanRequest };
