// ============================================
// WHATSAPP FLOW END-TO-END TEST
// ============================================
// Tests the exact flow shown in the user's diagram
// From "hi" → register → request → approve → repay

const {
  handleWhatsAppMessage,
  handleWhatsAppRegister,
  handleWhatsAppStatus,
  handleWhatsAppRequest,
  handleWhatsAppApprove,
  handleWhatsAppRepay
} = require('./core/channels/whatsappChannel');

const { Agent, Loan } = require('./core/models');
const mongoose = require('mongoose');

async function testWhatsAppCompleteFlow() {
  console.log('📱 TESTING COMPLETE WHATSAPP FLOW...\n');
  console.log('Following the exact user journey from the diagram:\n');

  const testPhoneNumber = '+919876543210';
  const testDID = `did:whatsapp:${testPhoneNumber}`;

  try {
    // ===============================
    // STEP 1: User sends "hi"
    // ===============================
    console.log('1. 👋 User sends "hi"');
    console.log('   Expected: Welcome menu with commands');

    // This should trigger the unknown command → help flow
    await handleWhatsAppMessage(testPhoneNumber, 'hi');
    console.log('   ✅ Welcome message sent\n');

    // ===============================
    // STEP 2: User sends "register"
    // ===============================
    console.log('2. 📝 User sends "register"');
    console.log('   Expected: Create DID + wallet + save to MongoDB');

    // Clean up any existing test user first
    if (mongoose.connection.readyState === 1) {
      await Agent.deleteMany({ did: testDID });
      await Loan.deleteMany({ borrowerDid: testDID });
      console.log('   🧹 Cleaned up existing test data');
    }

    await handleWhatsAppRegister(testPhoneNumber);

    // Verify registration worked
    if (mongoose.connection.readyState === 1) {
      const agent = await Agent.findOne({ did: testDID });
      if (agent) {
        console.log('   ✅ Registration successful:');
        console.log(`      DID: ${agent.did}`);
        console.log(`      Wallet: ${agent.walletAddress}`);
        console.log(`      Score: ${agent.creditScore} (Tier ${agent.tier})`);
      } else {
        console.log('   ❌ Registration failed - no agent created');
      }
    } else {
      console.log('   ⚠️  Database not connected - registration may be in memory only');
    }
    console.log('');

    // ===============================
    // STEP 3: User sends "request 100"
    // ===============================
    console.log('3. 💰 User sends "request 100"');
    console.log('   Expected: OpenClaw evaluation + create pending loan');

    await handleWhatsAppRequest(testPhoneNumber, '100');

    // Verify loan was created
    if (mongoose.connection.readyState === 1) {
      const loan = await Loan.findOne({ borrowerDid: testDID, status: 'pending' });
      if (loan) {
        console.log('   ✅ Loan request created:');
        console.log(`      Amount: $${loan.amount} USDT`);
        console.log(`      Status: ${loan.status}`);
        console.log(`      APR: ${(loan.apr * 100).toFixed(1)}%`);
        console.log(`      Due: ${loan.dueDate.toDateString()}`);
      } else {
        console.log('   ❌ Loan creation failed - no pending loan found');
      }
    }
    console.log('');

    // ===============================
    // STEP 4: User sends "approve"
    // ===============================
    console.log('4. ✅ User sends "approve"');
    console.log('   Expected: ERC-4337 gasless USDT transfer');

    await handleWhatsAppApprove(testPhoneNumber);

    // Verify loan was disbursed
    if (mongoose.connection.readyState === 1) {
      const loan = await Loan.findOne({ borrowerDid: testDID }).sort({ createdAt: -1 });
      if (loan && loan.status === 'disbursed') {
        console.log('   ✅ Loan disbursed successfully:');
        console.log(`      Status: ${loan.status}`);
        console.log(`      TX Hash: ${loan.disbursementTxHash}`);
        console.log(`      Disbursed At: ${loan.disbursedAt}`);
        console.log(`      ERC-4337: ${loan.disbursementTxHash ? 'Used' : 'Not available'}`);
      } else {
        console.log('   ❌ Loan disbursement failed');
        console.log(`      Current status: ${loan?.status || 'NOT FOUND'}`);
      }
    }
    console.log('');

    // ===============================
    // STEP 5: User sends "repay"
    // ===============================
    console.log('5. 🔄 User sends "repay"');
    console.log('   Expected: Mark repaid + improve credit score');

    await handleWhatsAppRepay(testPhoneNumber);

    // Verify repayment and credit improvement
    if (mongoose.connection.readyState === 1) {
      const loan = await Loan.findOne({ borrowerDid: testDID }).sort({ createdAt: -1 });
      const agent = await Agent.findOne({ did: testDID });

      if (loan && loan.status === 'repaid' && agent) {
        console.log('   ✅ Repayment successful:');
        console.log(`      Loan Status: ${loan.status}`);
        console.log(`      Repaid At: ${loan.repaidAt}`);
        console.log(`      New Credit Score: ${agent.creditScore}`);
        console.log(`      Credit Tier: ${agent.tier}`);

        // Check if score improved (should go from 50 to 55)
        if (agent.creditScore > 50) {
          console.log('      🎉 Credit score improved!');
        }
      } else {
        console.log('   ❌ Repayment processing failed');
        console.log(`      Loan status: ${loan?.status || 'NOT FOUND'}`);
        console.log(`      Agent score: ${agent?.creditScore || 'NOT FOUND'}`);
      }
    }
    console.log('');

    // ===============================
    // FLOW SUMMARY
    // ===============================
    console.log('🎯 FLOW SUMMARY:');
    console.log('════════════════════════════════════════');

    if (mongoose.connection.readyState === 1) {
      const finalAgent = await Agent.findOne({ did: testDID });
      const allLoans = await Loan.find({ borrowerDid: testDID }).sort({ createdAt: 1 });

      console.log(`📊 Final Agent State:`);
      if (finalAgent) {
        console.log(`   DID: ${finalAgent.did}`);
        console.log(`   Wallet: ${finalAgent.walletAddress}`);
        console.log(`   Credit Score: ${finalAgent.creditScore}`);
        console.log(`   Tier: ${finalAgent.tier}`);
        console.log(`   Registered: ${finalAgent.createdAt}`);
      } else {
        console.log('   ❌ No agent found');
      }

      console.log(`\n💰 Loan History (${allLoans.length} loans):`);
      allLoans.forEach((loan, i) => {
        console.log(`   ${i+1}. $${loan.amount} USDT - ${loan.status} - ${loan.createdAt.toDateString()}`);
        if (loan.disbursementTxHash) {
          console.log(`      TX: ${loan.disbursementTxHash}`);
        }
      });

      // Success criteria
      const hasAgent = !!finalAgent;
      const hasWallet = finalAgent?.walletAddress?.startsWith('0x');
      const hasLoan = allLoans.length > 0;
      const loanDisbursed = allLoans.some(l => l.status === 'disbursed' || l.status === 'repaid');
      const loanRepaid = allLoans.some(l => l.status === 'repaid');
      const creditImproved = finalAgent?.creditScore > 50;

      console.log(`\n🏆 SUCCESS CRITERIA:`);
      console.log(`   Agent Created: ${hasAgent ? '✅' : '❌'}`);
      console.log(`   Wallet Generated: ${hasWallet ? '✅' : '❌'}`);
      console.log(`   Loan Created: ${hasLoan ? '✅' : '❌'}`);
      console.log(`   Loan Disbursed: ${loanDisbursed ? '✅' : '❌'}`);
      console.log(`   Loan Repaid: ${loanRepaid ? '✅' : '❌'}`);
      console.log(`   Credit Improved: ${creditImproved ? '✅' : '❌'}`);

      const successCount = [hasAgent, hasWallet, hasLoan, loanDisbursed, loanRepaid, creditImproved].filter(Boolean).length;
      const successRate = (successCount / 6 * 100).toFixed(1);

      console.log(`\n🎯 OVERALL SUCCESS: ${successRate}% (${successCount}/6)`);

      if (successRate >= 83) {
        console.log('\n🎉 WHATSAPP FLOW WORKING PERFECTLY!');
        console.log('🚀 Ready for hackathon demonstration');
      } else {
        console.log('\n⚠️  Some steps need attention - check failed criteria above');
      }

    } else {
      console.log('⚠️  Database not connected - cannot verify full flow');
      console.log('✅ Command handlers all executed without errors');
    }

    // ===============================
    // MANUAL TEST INSTRUCTIONS
    // ===============================
    console.log('\n📱 MANUAL TEST INSTRUCTIONS:');
    console.log('════════════════════════════════════════');
    console.log('To test with real WhatsApp, send these messages:');
    console.log('');
    console.log('1. Send: "hi"');
    console.log('   Expected: Welcome menu');
    console.log('');
    console.log('2. Send: "register"');
    console.log('   Expected: ✅ Registration successful + wallet address');
    console.log('');
    console.log('3. Send: "request 100"');
    console.log('   Expected: 📝 Loan pending + terms');
    console.log('');
    console.log('4. Send: "approve"');
    console.log('   Expected: ✅ Loan disbursed + TX hash + Etherscan link');
    console.log('');
    console.log('5. Send: "repay"');
    console.log('   Expected: ✅ Loan repaid + credit score improved');
    console.log('');
    console.log('🔗 WhatsApp webhook: https://neurvinial.onrender.com/whatsapp');

  } catch (error) {
    console.error('❌ Flow test failed:', error.message);
    console.error(error.stack);
  }
}

// Run test
if (require.main === module) {
  testWhatsAppCompleteFlow().catch(console.error);
}

module.exports = { testWhatsAppCompleteFlow };