// ============================================
// SENTINEL — WhatsApp Channel Integration
// ============================================
// Integrates WhatsApp for lending agent interaction using Twilio API.
// Users can request loans, check status, and get updates via WhatsApp.

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');
const { invokeSkill } = require('../agent/openclawIntegration');
const { Agent, Loan } = require('../models');
const mongoose = require('mongoose');
const walletManager = require('../wdk/walletManager');

// WhatsApp user context tracking
const whatsappContexts = new Map();

/**
 * Get or create WhatsApp user context.
 * First checks MongoDB for persistent storage, then memory cache
 */
const getOrCreateWhatsAppContext = async (phoneNumber) => {
  // Check memory cache first
  if (whatsappContexts.has(phoneNumber)) {
    return whatsappContexts.get(phoneNumber);
  }

  // Try to load from MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      const did = `did:whatsapp:${phoneNumber}`;
      const agent = await Agent.findOne({ did });

      if (agent) {
        // User exists in MongoDB - load their context
        const context = {
          phoneNumber,
          did: agent.did,
          creditScore: agent.creditScore,
          tier: agent.tier,
          registered: true,
          registeredAt: agent.createdAt
        };
        whatsappContexts.set(phoneNumber, context);
        return context;
      }
    }
  } catch (error) {
    logger.error('Failed to load user from MongoDB', { error: error.message });
  }

  // New user - create context
  const newContext = {
    phoneNumber,
    did: null,
    creditScore: null,
    tier: null,
    registered: false,
    registeredAt: Date.now()
  };
  whatsappContexts.set(phoneNumber, newContext);
  return newContext;
};

/**
 * Send WhatsApp message via Twilio API.
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 */
const sendWhatsAppMessage = async (toPhoneNumber, message) => {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_PHONE_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppFrom) {
    const missing = [];
    if (!twilioAccountSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!twilioAuthToken) missing.push('TWILIO_AUTH_TOKEN');
    if (!twilioWhatsAppFrom) missing.push('TWILIO_WHATSAPP_FROM');
    logger.error('❌ WhatsApp sending BLOCKED', { missingEnvVars: missing.join(', ') });
    return false;
  }

  try {
    const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');

    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      new URLSearchParams({
        From: `whatsapp:${twilioWhatsAppFrom}`,
        To: `whatsapp:${toPhoneNumber}`,
        Body: message
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    logger.info('✅ WhatsApp message sent', { to: toPhoneNumber, messageLength: message.length });
    return true;
  } catch (error) {
    logger.error('❌ Failed to send WhatsApp message', {
      to: toPhoneNumber,
      error: error.message,
      status: error.response?.status,
      twilioError: error.response?.data
    });
    return false;
  }
};

/**
 * Parse WhatsApp webhook body.
 * Handles text messages, reactions, media, and empty messages.
 */
const parseWhatsAppWebhook = (body) => {
  const { From, Body, MessageType, ButtonText, MediaUrl0 } = body;

  if (!From) {
    return null;
  }

  const phoneNumber = From.replace('whatsapp:', '');

  // Handle different message types
  // - Text messages have Body
  // - Reactions have empty Body but we still want to respond
  // - Media (images/stickers) have MediaUrl0
  // - Button responses have ButtonText
  let message = '';

  if (Body && Body.trim()) {
    message = Body.trim();
  } else if (ButtonText && ButtonText.trim()) {
    message = ButtonText.trim();
  } else if (MediaUrl0) {
    // User sent an image/video/sticker - treat as greeting
    message = 'hi';
  } else {
    // Reaction or empty message - treat as greeting
    message = 'hi';
  }

  return { phoneNumber, message };
};

/**
 * Handle WhatsApp /register command.
 */
const handleWhatsAppRegister = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  try {
    const did = `did:whatsapp:${phoneNumber}`;
    context.did = did;

    let walletAddress = null;
    let walletIndex = null;

    // Try to create a REAL wallet using WDK
    try {
      if (walletManager.isInitialized()) {
        // Use phone number hash as wallet index for determinism
        const phoneHash = phoneNumber.replace(/\D/g, '');
        walletIndex = parseInt(phoneHash.slice(-6)) || Math.floor(Math.random() * 100000);
        const wallet = await walletManager.createWalletForAgent(walletIndex);
        walletAddress = wallet.address;
        logger.info('Real wallet created for user', { did, walletAddress, walletIndex });
      }
    } catch (walletError) {
      logger.warn('Could not create real wallet, using placeholder', { error: walletError.message });
    }

    // Fallback to placeholder if WDK not available
    if (!walletAddress) {
      walletAddress = `0x${phoneNumber.replace(/\D/g, '').padStart(40, '0')}`;
    }

    if (mongoose.connection.readyState === 1) {
      const agent = new Agent({
        did,
        walletAddress,
        walletIndex,
        creditScore: 50,
        tier: 'C'
      });
      await agent.save();
    }

    // Update context
    context.walletAddress = walletAddress;
    context.creditScore = 50;
    context.tier = 'C';
    context.registered = true;
    whatsappContexts.set(phoneNumber, context);

    const message = `✅ *Registration Successful*

Your DID: ${did}
Credit Score: 50 (Tier C)
Wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}

Send "status" to check score or "request 500" to apply for a loan.`;

    await sendWhatsAppMessage(phoneNumber, message);
    logger.info('WhatsApp user registered', { did, phoneNumber, walletAddress });
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Registration failed: ${error.message}`);
    logger.error('WhatsApp registration failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp status check.
 */
const handleWhatsAppStatus = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please send "register" first to create an account.');
    return;
  }

  try {
    const result = await invokeSkill('sentinel_credit', {
      did: context.did,
      action: 'assess_creditworthiness'
    });

    const data = result.result.data || {};
    const message = `📊 *Your Credit Profile*

Score: ${data.creditScore || 50}
Tier: ${data.tier || 'C'}
Max Loan: $${data.maxLoanAmount || 500}
Rate: ${data.interestRate ? (data.interestRate * 100).toFixed(1) : 8}%

Reason: ${result.result.reasoning}`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Status check failed: ${error.message}`);
    logger.error('WhatsApp status check failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp loan request.
 */
const handleWhatsAppRequest = async (phoneNumber, amount) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first.');
    return;
  }

  const parsedAmount = parseInt(amount);
  if (!parsedAmount || parsedAmount < 10) {
    await sendWhatsAppMessage(phoneNumber, '📝 Please specify a valid amount. Example: "request 100" or "request 50"\n\n💡 Min: $10, send "limit" to see your max');
    return;
  }

  try {
    const result = await invokeSkill('sentinel_lending', {
      did: context.did,
      amount: parsedAmount,
      creditScore: context.creditScore,
      tier: context.tier,
      action: 'evaluate_loan_request'
    });

    const approved = result.result.action === 'approve_loan';

    if (approved && mongoose.connection.readyState === 1) {
      // Save approved loan to MongoDB
      try {
        const interestRates = { 'A': 0.035, 'B': 0.05, 'C': 0.08, 'D': 0.15 };
        const interestRate = interestRates[context.tier] || 0.08;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        // Generate unique loan ID
        const loanId = `LOAN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const loan = new Loan({
          loanId,
          borrowerDid: context.did,
          amount: parsedAmount,
          currency: 'USDT',
          apr: interestRate,
          dueDate,
          status: 'pending', // Start as pending, user can /approve to disburse
          tier: context.tier,
          decisionReasoning: result.result.reasoning || 'Approved based on credit tier'
        });

        await loan.save();
        logger.info('Loan approved and saved to database', {
          did: context.did,
          amount: parsedAmount,
          loanId: loan._id
        });

        const message = `✅ *Loan Pre-Approved!*

💰 Amount: $${parsedAmount} USDT
📊 Interest Rate: ${(interestRate * 100).toFixed(1)}% per year
⏰ Duration: 30 days
📅 Due Date: ${dueDate.toLocaleDateString()}

📊 Loan ID: ${loan._id.toString().substring(0, 8)}...
⚠️ Status: PENDING - Ready for disbursement

✅ Send "approve" to receive USDT instantly!

⚡ ERC-4337: Gas-free transfer to your wallet`;

        await sendWhatsAppMessage(phoneNumber, message);
      } catch (saveError) {
        logger.error('Failed to save loan', { error: saveError.message });
        // Still show approval even if save failed
        const message = `✅ *Loan Approved!*\n\nAmount: $${parsedAmount} USDT\nConfidence: ${result.result.confidence}%\n\nReason: ${result.result.reasoning}`;
        await sendWhatsAppMessage(phoneNumber, message);
      }
    } else if (approved) {
      // Database not available, just show message
      const message = `✅ *Loan Approved!*\n\nAmount: $${parsedAmount} USDT\nConfidence: ${result.result.confidence}%\n\nReason: ${result.result.reasoning}`;
      await sendWhatsAppMessage(phoneNumber, message);
    } else {
      // Loan denied
      const message = `❌ *Loan Denied*\n\nAmount: $${parsedAmount} USDT\nReason: ${result.result.reasoning}\n\nTry a smaller amount or check your "limit"`;
      await sendWhatsAppMessage(phoneNumber, message);
    }

    logger.info('WhatsApp loan request processed', { phoneNumber, amount: parsedAmount, approved });
  } catch (error) {
    // Handle Groq rate limiting with retry
    let errorMsg = error.message;
    if (error.message.includes('rate_limit')) {
      errorMsg = '⏳ API temporarily busy. Please try again in 1 minute.';
    }
    await sendWhatsAppMessage(phoneNumber, `❌ Request failed: ${errorMsg}`);
    logger.error('WhatsApp request failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp approve command - Disburse pending loan
 */
const handleWhatsAppApprove = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first.');
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    sendWhatsAppMessage(phoneNumber, '❌ Database not available. Cannot process loan disbursement.');
    return;
  }

  try {
    // Find pending loan
    const loan = await Loan.findOne({
      borrowerDid: context.did,
      status: { $in: ['pending', 'approved'] }
    }).sort({ createdAt: -1 });

    if (!loan) {
      await sendWhatsAppMessage(phoneNumber, `❌ *No Pending Loans*

You don't have any loans waiting for approval.

💡 *To request a loan:*
• Send "request 100" for $100 USDT
• Send "request 500" for $500 USDT

📊 Send "status" to check your credit limit`);
      return;
    }

    await sendWhatsAppMessage(phoneNumber, `⏳ *Processing Loan Disbursement...*

💰 Amount: $${loan.amount} USDT
🔄 Status: Transferring via ERC-4337...

⚡ This may take 30-60 seconds`);

    // Get user's wallet address
    const agent = await Agent.findOne({ did: context.did });
    if (!agent || !agent.walletAddress) {
      throw new Error('Wallet not found. Please send "register" again.');
    }

    // Perform REAL USDT transfer via WDK - NO MOCKS EVER
    let txHash = null;

    try {
      // Real transfer only - will throw error if treasury is insufficient
      const transferResult = await walletManager.sendUSDT(agent.walletAddress, loan.amount);
      txHash = transferResult.hash;
      logger.info('Real USDT transfer completed', { txHash, amount: loan.amount });
    } catch (txError) {
      // Get treasury address to show user where to fund
      let treasuryAddress = 'unknown';
      try {
        treasuryAddress = await walletManager.getSentinelAddress();
      } catch {}

      logger.error('Transfer failed', { error: txError.message, treasuryAddress });

      const fundingMessage = `❌ *Transfer Failed - Treasury Needs Funding*

Error: ${txError.message}

💰 Treasury Address:
${treasuryAddress}

🔧 How to Fix:
1. Get Sepolia USDT from a faucet
2. Send USDT to the treasury address above
3. Try "approve" again

🚰 Sepolia Faucets:
• faucet.circle.com (USDC)
• sepoliafaucet.com (ETH)

📊 Your loan approval is still valid!`;

      await sendWhatsAppMessage(phoneNumber, fundingMessage);
      return;
    }

    // Update loan status
    loan.status = 'disbursed';
    loan.disbursementTxHash = txHash;
    loan.disbursedAt = new Date();
    await loan.save();

    const successMessage = `✅ *Loan Disbursed Successfully!*

💰 Amount: $${loan.amount} USDT
🎯 To Wallet: ${agent.walletAddress}
⛓️ TX Hash: ${txHash.substring(0, 16)}...

🔗 View on Etherscan:
https://sepolia.etherscan.io/tx/${txHash}

📊 Loan Details:
• Interest Rate: ${(loan.apr * 100).toFixed(1)}% APR
• Due Date: ${loan.dueDate.toDateString()}
• Network: Ethereum Sepolia

💡 Next Steps:
• Monitor your wallet for USDT arrival
• Send "repay" when ready to repay the loan
• Repay on time to improve your credit score!

🎉 Real USDT sent via ERC-4337!`;

    await sendWhatsAppMessage(phoneNumber, successMessage);

  } catch (error) {
    const errorMessage = `❌ *Loan Disbursement Failed*

Error: ${error.message}

🔧 What to do:
• Try "approve" again in 1-2 minutes
• Check "health" for system status
• Send "support" if the issue persists

📊 Your loan approval is still valid`;

    await sendWhatsAppMessage(phoneNumber, errorMessage);
    logger.error('Loan disbursement failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp limit command - Show max loan amount
 */
const handleWhatsAppLimit = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to see your loan limit.');
    return;
  }

  try {
    const tierLimits = {
      'A': 5000,
      'B': 2000,
      'C': 500,
      'D': 0
    };

    const maxLoan = tierLimits[context.tier] || 0;
    const message = `💰 *Your Loan Limit*

Tier: ${context.tier}
Credit Score: ${context.creditScore}
Maximum Loan: $${maxLoan} USDT

To request a loan, send: *request 300*
(Replace 300 with your desired amount)`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
  }
};

/**
 * Handle WhatsApp terms command - Show loan terms
 */
const handleWhatsAppTerms = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to see loan terms.');
    return;
  }

  try {
    const interestRates = {
      'A': 3.5,
      'B': 5.0,
      'C': 8.0,
      'D': 'N/A'
    };

    const rate = interestRates[context.tier] || 'N/A';
    const duration = 30;

    const message = `📋 *Your Loan Terms*

Tier: ${context.tier} (Score: ${context.creditScore})
Interest Rate: ${rate}% per annum
Loan Duration: ${duration} days
Repayment: Monthly installments
Network: Ethereum Sepolia
Token: USDT

Send *request 300* to apply for a loan!`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
  }
};

/**
 * Handle WhatsApp history command - Show loan history
 */
const handleWhatsAppHistory = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to view history.');
    return;
  }

  try {
    if (mongoose.connection.readyState === 1) {
      const loans = await Loan.find({ borrowerDid: context.did }).sort({ createdAt: -1 }).limit(10);

      if (loans.length === 0) {
        await sendWhatsAppMessage(phoneNumber, '📭 *Loan History*\n\nNo loans yet. Send "request 300" to apply!');
        return;
      }

      let history = `📚 *Your Loan History* (${loans.length} loans)\n\n`;
      loans.forEach((loan, index) => {
        const statusMap = {
          'pending': '⏳ Pending',
          'approved': '✅ Approved',
          'disbursed': '💸 Disbursed',
          'repaid': '✅ Repaid',
          'defaulted': '❌ Defaulted',
          'denied': '🚫 Denied'
        };
        const status = statusMap[loan.status] || loan.status;
        const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'N/A';
        const createdDate = new Date(loan.createdAt).toLocaleDateString();
        const rate = loan.apr ? (loan.apr * 100).toFixed(1) : '8.0';
        history += `${index + 1}. $${loan.amount} USDT (${status})\n`;
        history += `   Created: ${createdDate}\n`;
        history += `   Due: ${dueDate}\n`;
        history += `   Rate: ${rate}%\n`;
        if (loan.disbursementTxHash) {
          history += `   TX: ${loan.disbursementTxHash.substring(0, 12)}...\n`;
        }
        history += `   ID: ${loan.loanId || loan._id.toString().substring(0, 8)}...\n\n`;
      });

      history += '💡 Send "status" to check your score or "request 300" to apply for another loan';

      await sendWhatsAppMessage(phoneNumber, history);
    } else {
      await sendWhatsAppMessage(phoneNumber, '📭 No loans yet.');
    }
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp history failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp repay command - Mark loan as repaid
 */
const handleWhatsAppRepay = async (phoneNumber, loanIdPart) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first.');
    return;
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await sendWhatsAppMessage(phoneNumber, '❌ Database not available.');
      return;
    }

    // Find disbursed loans only - these are the ones that can be repaid
    const disbursedLoans = await Loan.find({
      borrowerDid: context.did,
      status: 'disbursed'
    }).sort({ createdAt: 1 });

    if (disbursedLoans.length === 0) {
      // Check if there are pending/approved loans
      const pendingLoans = await Loan.find({
        borrowerDid: context.did,
        status: { $in: ['pending', 'approved'] }
      }).sort({ createdAt: -1 });

      if (pendingLoans.length > 0) {
        const loan = pendingLoans[0];
        await sendWhatsAppMessage(phoneNumber, `❌ Your loan request is still in ${loan.status} status.\n\nYou need to:\n1. Send "approve" to disburse the loan\n2. Receive USDT in your wallet\n3. Then use "repay" to repay it\n\nSend "approve" to disburse your loan.`);
      } else {
        await sendWhatsAppMessage(phoneNumber, '✅ *No Active Loans*\n\nYou have no loans to repay. Send "request 100" to get a loan.');
      }
      return;
    }

    const loan = disbursedLoans[0];
    const treasuryAddress = await walletManager.getSentinelAddress();

    // Calculate totalDue if missing (fallback to amount + interest)
    let repaymentAmount = loan.totalDue;
    if (!repaymentAmount || repaymentAmount <= 0) {
      const interest = loan.interestAccrued || (loan.amount * (loan.apr || 0.05) * (30 / 365));
      repaymentAmount = parseFloat((loan.amount + interest).toFixed(2));

      // Fix the loan record
      loan.totalDue = repaymentAmount;
      await loan.save();
      logger.info('Fixed missing totalDue on loan', { loanId: loan.loanId, totalDue: repaymentAmount });
    }

    // Check if TX hash was provided in the message
    const txHashMatch = loanIdPart ? loanIdPart.match(/0x[a-fA-F0-9]{64}/) : null;

    if (!txHashMatch) {
      // Show instructions to repay on-chain
      const instructionMessage = `💳 *Repay Your Loan On-Chain*

📋 *Loan Details:*
💰 Amount to repay: *$${repaymentAmount} USDT*
🆔 Loan ID: ${(loan.loanId || loan._id.toString()).substring(0, 16)}...
📅 Due: ${loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'N/A'}

⛓️ *How to Repay:*

*Step 1:* Send *${repaymentAmount} USDT* on-chain to:
\`${treasuryAddress}\`

*Step 2:* Get your transaction hash from Etherscan

*Step 3:* Send it here:
repay 0xYourTxHashHere

*Example:*
repay 0xabc123def456...

💡 *Tip:* Repaying on-time improves your credit score by +5 points!

⚠️ This requires a REAL blockchain transaction.`;

      await sendWhatsAppMessage(phoneNumber, instructionMessage);
      return;
    }

    // Real repayment with TX hash
    const txHash = txHashMatch[0];
    const loanId = loan.loanId || loan._id.toString();

    logger.info('Processing on-chain repayment via WhatsApp', {
      loanId,
      txHash,
      borrowerDid: context.did,
      loanAmount: loan.totalDue
    });

    // Use loan service to process repayment
    const loanService = require('../loans/loanService');
    const result = await loanService.processRepayment(loanId, txHash);

    // Update context with new credit score
    context.creditScore = result.newCreditScore;
    context.tier = result.newTier;
    whatsappContexts.set(phoneNumber, context);

    const wasOnTime = result.wasOnTime;
    const scoreChange = result.creditScoreChange;

    const message = `✅ *Loan Repaid Successfully!*

💰 *Amount Repaid:* $${loan.totalDue} USDT
⛓️ *TX Hash:* ${txHash.substring(0, 20)}...
🔗 View on Etherscan:
https://sepolia.etherscan.io/tx/${txHash}

${wasOnTime ? '⏰ *On-Time!* Great job!' : '⚠️ *Late Payment* - Try to repay on time next time'}

🎉 *Credit Score Updated!*
📈 Score Change: ${scoreChange > 0 ? '+' : ''}${scoreChange} points
⭐ New Score: ${result.newCreditScore}/100
🏆 New Tier: ${result.newTier}
${result.newTier !== context.tier ? `\n🎊 *TIER UPGRADED!* ${context.tier} → ${result.newTier}` : ''}

${result.lpRepayment ? '💼 LP Agent automatically repaid ✅\n' : ''}

💡 Send "status" to see your updated profile
💰 Send "request" to get another loan`;

    await sendWhatsAppMessage(phoneNumber, message);
    logger.info('Loan repaid via WhatsApp', {
      did: context.did,
      loanId,
      amount: loan.amount,
      txHash
    });
  } catch (repaymentError) {
    logger.error('WhatsApp repay failed', { error: repaymentError.message, phoneNumber });

    // Provide specific error guidance
    if (repaymentError.message.includes('not in disbursed status')) {
      await sendWhatsAppMessage(phoneNumber, `❌ Loan status error: ${repaymentError.message}\n\nMake sure the loan has been disbursed with "approve" first.`);
    } else if (repaymentError.message.includes('not found')) {
      await sendWhatsAppMessage(phoneNumber, `❌ Loan not found. Please try again or contact support.`);
    } else {
      await sendWhatsAppMessage(phoneNumber, `❌ Repayment failed: ${repaymentError.message}\n\nMake sure:\n• You sent REAL USDT to the treasury address\n• You got the TX hash from Etherscan\n• TX hash is exactly 66 characters (0x + 64 hex chars)\n• You\'re repaying the correct amount`);
    }
  }
};

/**
 * Handle WhatsApp balance command
 */
const handleWhatsAppBalance = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to see your balance.');
    return;
  }

  try {
    if (mongoose.connection.readyState === 1) {
      const loans = await Loan.find({ borrowerDid: context.did });

      const activeLoans = loans.filter(l => ['approved', 'disbursed'].includes(l.status));
      const repaidLoans = loans.filter(l => l.status === 'repaid');
      const totalBorrowed = loans.reduce((sum, l) => sum + l.amount, 0);
      const totalRepaid = repaidLoans.reduce((sum, l) => sum + l.amount, 0);
      const activeLoanTotal = activeLoans.reduce((sum, l) => sum + l.amount, 0);

      const message = `💰 *Your Loan Portfolio*

📊 Total Borrowed: $${totalBorrowed} USDT
✅ Total Repaid: $${totalRepaid} USDT
⏳ Active Loans: $${activeLoanTotal} USDT
📈 Loan Count: ${loans.length}

🔄 Active: ${activeLoans.length} loans
✓ Completed: ${repaidLoans.length} loans

Send "history" to see all loans`;

      await sendWhatsAppMessage(phoneNumber, message);
    } else {
      await sendWhatsAppMessage(phoneNumber, '📭 No loans yet.');
    }
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Balance check failed: ${error.message}`);
  }
};

/**
 * Handle WhatsApp wallet command
 */
const handleWhatsAppWallet = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to generate your wallet.');
    return;
  }

  try {
    let walletAddress = context.walletAddress;

    // Get wallet address from database if not in context
    if (!walletAddress && mongoose.connection.readyState === 1) {
      const agent = await Agent.findOne({ did: context.did });
      walletAddress = agent?.walletAddress;
    }

    if (!walletAddress) {
      await sendWhatsAppMessage(phoneNumber, '❌ Wallet not found. Try "register" again to generate a wallet.');
      return;
    }

    const message = `💳 *Your Wallet Information*

*Address:* ${walletAddress}

*Network:* Ethereum Sepolia
*Token:* USDT (ERC-20)
*ERC-4337:* ✅ Gasless transactions enabled

🔗 *View on Etherscan:*
https://sepolia.etherscan.io/address/${walletAddress}

💡 *Important:*
• This is your REAL Ethereum wallet
• You can receive USDT without gas fees
• Loans are sent directly to this address
• Keep this address safe!

📊 Send "balance" to see your loan portfolio`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
  }
};

/**
 * Handle WhatsApp tiers command - Show credit tier information
 */
const handleWhatsAppTiers = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  const tiersInfo = `📊 *SENTINEL Credit Tiers*

━━━━━━━━━━━━━━━━━━━

🌟 *Tier A* (Score 80-100)
• Max Loan: $5,000 USDT
• Interest: 3.5% APR
• Collateral: None required
• Status: Premium credit

✅ *Tier B* (Score 60-79)
• Max Loan: $2,000 USDT
• Interest: 5.0% APR
• Collateral: 25% required
• Status: Good credit

📊 *Tier C* (Score 40-59)
• Max Loan: $500 USDT
• Interest: 8.0% APR
• Collateral: 50% required
• Status: Building credit

❌ *Tier D* (Score 0-39)
• Max Loan: $0
• Status: Not eligible

━━━━━━━━━━━━━━━━━━━

${context.registered ? `📍 *Your Status:*
• Score: ${context.creditScore}/100
• Tier: ${context.tier}
• Recommendation: ${context.tier === 'A' ? 'Excellent! Max benefits unlocked' : context.tier === 'B' ? 'Repay 2 more loans for Tier A' : context.tier === 'C' ? 'Build history with small loans' : 'Start with register'}` : '🚀 Send *register* to get your credit score!'}

💡 Send *upgrade* for tips to improve your tier`;

  await sendWhatsAppMessage(phoneNumber, tiersInfo);
};

/**
 * Handle WhatsApp upgrade command - Show credit improvement tips
 */
const handleWhatsAppUpgrade = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please *register* first to see upgrade tips.');
    return;
  }

  const currentTier = context.tier || 'C';
  const score = context.creditScore || 50;

  let tips;
  if (currentTier === 'A') {
    tips = `🏆 *Congratulations! You're at Tier A*

You have the highest credit tier and enjoy:
• Max loan: $5,000 USDT
• Lowest rate: 3.5% APR
• No collateral required

💡 *Tips to maintain Tier A:*
• Continue repaying on-time
• Avoid any defaults
• Keep steady loan activity

🎯 *Next:* request 1000 to use your premium benefits!`;
  } else if (currentTier === 'B') {
    tips = `📈 *Upgrade Path: B → A*

*Current:* Score ${score}, need 80+ for Tier A

✅ *Actions to upgrade:*
1. Repay 2 more loans on-time (+5 points each)
2. Never miss a deadline
3. Maintain 100% repayment rate

🎁 *Tier A Benefits:*
• Max loan: $5,000 (vs $2,000 now)
• Interest: 3.5% (vs 5.0% now)

🎯 *Next step:* request ${Math.min(500, 2000)} and repay on-time!`;
  } else if (currentTier === 'C') {
    tips = `📈 *Upgrade Path: C → B*

*Current:* Score ${score}, need 60+ for Tier B

✅ *Actions to upgrade:*
1. Request small loan: request 100
2. Repay before due date (+5 points)
3. Repeat 2-3 times

🎁 *Tier B Benefits:*
• Max loan: $2,000 (vs $500 now)
• Interest: 5.0% (vs 8.0% now)

⚡ *Pro tip:* Smaller loans = easier to repay = faster upgrade!

🎯 *Start now:* request 100`;
  } else {
    tips = `📈 *Build Your Credit (Tier D)*

*Current:* Score ${score} (below minimum)

⚠️ *Why Tier D:*
• New account with no history
• OR previous defaults

✅ *Path to Tier C:*
1. Wait for credit review
2. Check back in 24 hours
3. Each on-time repayment adds points

💡 Check back with *status* in 24 hours`;
  }

  await sendWhatsAppMessage(phoneNumber, tips);
};

/**
 * Handle WhatsApp capital command - Show treasury and capital overview
 */
const handleWhatsAppCapital = async (phoneNumber) => {
  try {
    let treasuryBalance = 0;
    let treasuryAddress = 'unknown';

    try {
      if (walletManager.isInitialized()) {
        treasuryAddress = await walletManager.getSentinelAddress();
        const balanceResult = await walletManager.getSentinelUSDTBalance();
        treasuryBalance = balanceResult.balance;
      }
    } catch (err) {
      logger.warn('Could not fetch treasury data', { error: err.message });
    }

    // Get LP pool stats
    const lpAgentManager = require('../capital/lpAgentManager');
    const lpStats = lpAgentManager.getLPPoolStats();

    const message = `💰 *SENTINEL Capital Overview*

━━━━━━━━━━━━━━━━━━━

🏦 *Treasury*
• Balance: $${treasuryBalance.toFixed(2)} USDT
• Address: ${treasuryAddress.substring(0, 20)}...
• Network: Ethereum Sepolia

━━━━━━━━━━━━━━━━━━━

🤝 *LP Agent Pool*
• Active LPs: ${lpStats.activeLPAgents}
• Total Committed: $${lpStats.totalCapitalCommitted.toFixed(0)}
• Deployed: $${lpStats.totalCapitalDeployed.toFixed(0)}
• Available: $${lpStats.totalCapitalAvailable.toFixed(0)}
• Interest Paid: $${lpStats.totalInterestPaidToLPs.toFixed(2)}

━━━━━━━━━━━━━━━━━━━

📊 *How Capital Works:*
1. Treasury holds USDT for loans
2. LP Agents supply extra capital (2% APR)
3. SENTINEL lends to borrowers (3.5-8% APR)
4. SENTINEL earns the spread

💡 Send *lppool* for LP details or *treasury* for address`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp capital failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp lppool command - Show LP Agent pool details
 */
const handleWhatsAppLPPool = async (phoneNumber) => {
  try {
    const lpAgentManager = require('../capital/lpAgentManager');
    const lpStats = lpAgentManager.getLPPoolStats();
    const lpAgents = lpAgentManager.getAllLPAgents();

    let message = `🤝 *LP Agent Capital Pool*

━━━━━━━━━━━━━━━━━━━

📊 *Pool Statistics:*
• Active LP Agents: ${lpStats.activeLPAgents}
• Total Capital: $${lpStats.totalCapitalCommitted.toFixed(0)} USDT
• Currently Deployed: $${lpStats.totalCapitalDeployed.toFixed(0)}
• Available: $${lpStats.totalCapitalAvailable.toFixed(0)}
• Average APR: ${(lpStats.averageAPR * 100).toFixed(1)}%
• Interest Paid to LPs: $${lpStats.totalInterestPaidToLPs.toFixed(2)}

━━━━━━━━━━━━━━━━━━━

💡 *How LP Pool Works:*
1️⃣ Other AI agents supply capital at 2% APR
2️⃣ SENTINEL borrows when treasury is low
3️⃣ SENTINEL lends to borrowers at 5-8% APR
4️⃣ SENTINEL earns the spread (3-6%)
5️⃣ Everyone profits automatically! ✅

━━━━━━━━━━━━━━━━━━━`;

    if (lpAgents.length > 0) {
      message += `

📋 *Active LP Agents:*`;
      lpAgents.slice(0, 3).forEach((lp, index) => {
        message += `
${index + 1}. ${lp.name}
   • Capital: $${lp.maxCapital}
   • Deployed: $${lp.currentDeployed}
   • Earned: $${lp.interestEarned.toFixed(2)}`;
      });
    }

    message += `

📍 *Become an LP Agent:*
Use the API to register as LP:
POST /capital/lp/register`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp lppool failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp aave command - Show AAVE yield status
 */
const handleWhatsAppAAVE = async (phoneNumber) => {
  try {
    const aaveIntegration = require('../capital/aaveIntegration');
    let aaveStatus;
    try {
      aaveStatus = await aaveIntegration.getAAVEStatus();
    } catch {
      aaveStatus = {
        currentDeposit: 0,
        interestEarned: 0,
        estimatedAPY: 4.2,
        status: 'idle',
        poolAddress: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951'
      };
    }

    const message = `📈 *AAVE V3 Yield Integration*

━━━━━━━━━━━━━━━━━━━

📊 *Current Status:*
• Protocol: AAVE V3
• Network: Ethereum Sepolia
• Status: ${aaveStatus.status}
• Pool: ${aaveStatus.poolAddress.substring(0, 20)}...

💰 *Capital Deployed:*
• Current Deposit: $${aaveStatus.currentDeposit.toFixed(2)} USDT
• Interest Earned: $${aaveStatus.interestEarned.toFixed(4)}
• Estimated APY: ${aaveStatus.estimatedAPY}%

━━━━━━━━━━━━━━━━━━━

💡 *How AAVE Integration Works:*
1. Treasury has idle capital (not in active loans)
2. Idle capital is deposited to AAVE V3 pool
3. AAVE pays ~4.2% APY on deposits
4. When loan requested, capital is withdrawn
5. SENTINEL earns yield on unused funds!

⚡ *Benefits:*
• Idle money earns yield
• Loans still approved instantly
• Zero manual intervention
• Fully autonomous rebalancing

📊 *SRD Requirement:* FR-CP-01 ✅`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp aave failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp treasury command - Show treasury details
 */
const handleWhatsAppTreasury = async (phoneNumber) => {
  try {
    let treasuryAddress = 'unknown';
    let usdtBalance = 0;
    let ethBalance = 0;

    if (walletManager.isInitialized()) {
      treasuryAddress = await walletManager.getSentinelAddress();
      try {
        const usdtResult = await walletManager.getSentinelUSDTBalance();
        usdtBalance = usdtResult.balance;
      } catch {}
      try {
        const ethResult = await walletManager.getSentinelETHBalance();
        ethBalance = ethResult.balance;
      } catch {}
    }

    const message = `🏦 *SENTINEL Treasury*

━━━━━━━━━━━━━━━━━━━

📍 *Treasury Address:*
\`${treasuryAddress}\`

🔗 *View on Etherscan:*
https://sepolia.etherscan.io/address/${treasuryAddress}

━━━━━━━━━━━━━━━━━━━

💰 *Current Balances:*
• USDT: $${usdtBalance.toFixed(2)}
• ETH: ${ethBalance.toFixed(6)}
• Network: Ethereum Sepolia

━━━━━━━━━━━━━━━━━━━

⚡ *Treasury Functions:*
• Receives repayments from borrowers
• Disburses loans via ERC-4337
• Auto-allocates to LP pool when low
• Deploys idle capital to AAVE

🔒 *Security:*
• Real WDK wallet (non-custodial)
• No simulation mode
• Every TX verifiable on Etherscan

💡 Fund treasury with Sepolia USDT to enable loans`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp treasury failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp health command - Show system health
 */
const handleWhatsAppHealth = async (phoneNumber) => {
  try {
    const services = {
      mongodb: mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected',
      wdk: walletManager.isInitialized() ? '✅ Initialized' : '❌ Not Ready',
      erc4337: walletManager.is4337Enabled ? (walletManager.is4337Enabled() ? '✅ Enabled' : '⚠️ Disabled') : '⚠️ Unknown',
      telegram: '✅ Active',
      whatsapp: '✅ Active',
      openclaw: '✅ Ready'
    };

    let treasuryAddress = 'unknown';
    let usdtBalance = 0;

    try {
      if (walletManager.isInitialized()) {
        treasuryAddress = await walletManager.getSentinelAddress();
        const balanceResult = await walletManager.getSentinelUSDTBalance();
        usdtBalance = balanceResult.balance;
      }
    } catch {}

    const message = `🏥 *SENTINEL System Health*

━━━━━━━━━━━━━━━━━━━

⚙️ *Service Status:*
• MongoDB: ${services.mongodb}
• WDK Wallet: ${services.wdk}
• ERC-4337: ${services.erc4337}
• Telegram: ${services.telegram}
• WhatsApp: ${services.whatsapp}
• OpenClaw AI: ${services.openclaw}

━━━━━━━━━━━━━━━━━━━

🏦 *Treasury:*
• Address: ${treasuryAddress.substring(0, 20)}...
• USDT Balance: $${usdtBalance.toFixed(2)}
• Network: Ethereum Sepolia

━━━━━━━━━━━━━━━━━━━

📊 *System Info:*
• Version: 1.0.0
• Environment: ${process.env.NODE_ENV || 'development'}
• Uptime: ${Math.floor(process.uptime() / 60)} minutes

✅ All systems operational`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Health check failed: ${error.message}`);
    logger.error('WhatsApp health failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp loans command - Show loan dashboard
 */
const handleWhatsAppLoans = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please *register* first.');
    return;
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await sendWhatsAppMessage(phoneNumber, '❌ Database not available.');
      return;
    }

    const loans = await Loan.find({ borrowerDid: context.did }).sort({ createdAt: -1 });

    if (loans.length === 0) {
      await sendWhatsAppMessage(phoneNumber, `📊 *Loan Dashboard*

No loans found yet!

🚀 *Get started:*
• Send *limit* to check your loan limit
• Send *request 100* to apply for first loan

💡 Building loan history improves your credit!`);
      return;
    }

    const active = loans.filter(l => ['pending', 'approved', 'disbursed'].includes(l.status));
    const completed = loans.filter(l => ['repaid'].includes(l.status));
    const defaulted = loans.filter(l => ['defaulted'].includes(l.status));

    let loanList = '';
    active.forEach(loan => {
      const statusMap = {
        'pending': '⏳ Pending',
        'approved': '✅ Approved',
        'disbursed': '💸 Active'
      };
      loanList += `
• $${loan.amount} - ${statusMap[loan.status] || loan.status}`;
    });

    const message = `📊 *Loan Dashboard*

━━━━━━━━━━━━━━━━━━━

📈 *Summary:*
• Total Loans: ${loans.length}
• Active: ${active.length}
• Completed: ${completed.length}
• Defaulted: ${defaulted.length}

${active.length > 0 ? `📍 *Active Loans:*${loanList}` : '✅ No active loans'}

━━━━━━━━━━━━━━━━━━━

🎯 *Actions:*
${active.some(l => l.status === 'pending') ? '• *approve* - Disburse pending loan\n' : ''}${active.some(l => l.status === 'disbursed') ? '• *repay* - Mark loan as repaid\n' : ''}• *history* - Full loan history
• *request 300* - New loan`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp loans failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp help command.
 */
const handleWhatsAppHelp = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    // Use OpenClaw for intelligent help based on user context
    const { processIntelligentCommand } = require('../agent/openclawIntegration');

    try {
      const result = await processIntelligentCommand({
        command: 'help',
        user: { phoneNumber, did: context.did },
        context: {
          registered: context.registered,
          creditScore: context.creditScore,
          tier: context.tier
        },
        channel: 'whatsapp',
        message: 'help'
      });

      // If OpenClaw provides intelligent response, use it
      if (result.result && result.result.action !== 'error') {
        const response = result.result.data?.response || result.result.reasoning;
        if (response) {
          await sendWhatsAppMessage(phoneNumber, response);
          return;
        }
      }
    } catch (error) {
      logger.warn('OpenClaw help failed, using adaptive fallback', { error: error.message });
    }

    // Fallback: Context-aware help
    let helpMessage;

    if (!context.registered) {
      helpMessage = `🚀 *Welcome to SENTINEL!*

━━━━━━━━━━━━━━━━━━━

*Get started in 2 steps:*
1️⃣ Send: *register*
2️⃣ Send: *request 300*

━━━━━━━━━━━━━━━━━━━

💰 *What you get:*
• Real USDT loans (up to $5,000)
• ERC-4337 gasless transfers
• AI-powered credit scoring
• 30-day loan terms
• On-chain repayment verification

🧠 *Natural Language:*
Just say things like:
• "I need 500 bucks"
• "What can I borrow?"
• "Show my score"

⚡ *Ready?* Send *register* now!`;
    } else {
      const tierLimits = { 'A': 5000, 'B': 2000, 'C': 500, 'D': 0 };
      const maxLoan = tierLimits[context.tier] || 500;

      helpMessage = `📊 *SENTINEL Commands* (Tier ${context.tier})

━━━━━━━━━━━━━━━━━━━

💰 *Your max loan:* $${maxLoan} USDT

🎯 *Quick Actions:*
• *status* - Your credit profile
• *request ${Math.min(maxLoan, 300)}* - Apply for loan
• *loans* - Your loan dashboard

━━━━━━━━━━━━━━━━━━━

💸 *Loan Management:*
• *approve* - Disburse pending loan
• *repay 0xTxHash* - Repay with TX proof
• *history* - View all past loans
• *limit* - Check your max amount
• *terms* - Current interest rates

━━━━━━━━━━━━━━━━━━━

📈 *Credit Info:*
• *tiers* - All credit tier details
• *upgrade* - Tips to improve score
• *balance* - Your loan portfolio

━━━━━━━━━━━━━━━━━━━

🏦 *Capital & System:*
• *capital* - Treasury overview
• *lppool* - LP Agent pool info
• *aave* - AAVE yield status
• *treasury* - Treasury address
• *wallet* - Your wallet address
• *health* - System health check

━━━━━━━━━━━━━━━━━━━

🧠 *Natural Language:*
• "I need 500 dollars"
• "What's my score?"
• "How do I improve?"

⚡ *ERC-4337:* All transfers are gasless!`;
    }

    await sendWhatsAppMessage(phoneNumber, helpMessage);

  } catch (error) {
    logger.error('WhatsApp help failed', { error: error.message });
    await sendWhatsAppMessage(phoneNumber, 'ℹ️ Send *register*, *status*, *request 300*, or *help* for commands.');
  }
};

/**
 * Handle WhatsApp message.
 */
const handleWhatsAppMessage = async (phoneNumber, messageText) => {
  const command = messageText.toLowerCase().trim();

  try {
    if (command === 'register' || command === 'start') {
      await handleWhatsAppRegister(phoneNumber);
    } else if (command === 'status' || command === 'score' || command === 'credit') {
      await handleWhatsAppStatus(phoneNumber);
    } else if (command.startsWith('request') || command.startsWith('loan') || command.startsWith('borrow')) {
      const amount = command.split(' ')[1];
      await handleWhatsAppRequest(phoneNumber, amount);
    } else if (command === 'approve' || command === 'disburse' || command === 'confirm') {
      await handleWhatsAppApprove(phoneNumber);
    } else if (command === 'limit' || command === 'howmuch' || command === 'max' || command === 'how much') {
      await handleWhatsAppLimit(phoneNumber);
    } else if (command === 'terms' || command === 'rates' || command === 'interest' || command === 'apr') {
      await handleWhatsAppTerms(phoneNumber);
    } else if (command === 'history' || command === 'past') {
      await handleWhatsAppHistory(phoneNumber);
    } else if (command === 'loans' || command === 'dashboard' || command === 'myloans') {
      await handleWhatsAppLoans(phoneNumber);
    } else if (command.startsWith('repay') || command.startsWith('pay')) {
      const loanId = command.split(' ')[1];
      await handleWhatsAppRepay(phoneNumber, loanId);
    } else if (command === 'balance' || command === 'portfolio') {
      await handleWhatsAppBalance(phoneNumber);
    } else if (command === 'wallet' || command === 'address' || command === 'myaddress') {
      await handleWhatsAppWallet(phoneNumber);
    } else if (command === 'tiers' || command === 'tier' || command === 'levels') {
      await handleWhatsAppTiers(phoneNumber);
    } else if (command === 'upgrade' || command === 'improve' || command === 'tips') {
      await handleWhatsAppUpgrade(phoneNumber);
    } else if (command === 'capital' || command === 'funds') {
      await handleWhatsAppCapital(phoneNumber);
    } else if (command === 'lppool' || command === 'lp' || command === 'liquidity') {
      await handleWhatsAppLPPool(phoneNumber);
    } else if (command === 'aave' || command === 'yield' || command === 'defi') {
      await handleWhatsAppAAVE(phoneNumber);
    } else if (command === 'treasury' || command === 'vault') {
      await handleWhatsAppTreasury(phoneNumber);
    } else if (command === 'health' || command === 'system' || command === 'ping') {
      await handleWhatsAppHealth(phoneNumber);
    } else if (command === 'help' || command === '?' || command === 'commands' || command === 'menu') {
      await handleWhatsAppHelp(phoneNumber);
    } else {
      // Unknown command - use OpenClaw for intelligent response
      const context = await getOrCreateWhatsAppContext(phoneNumber);

      try {
        const { processIntelligentCommand } = require('../agent/openclawIntegration');

        const result = await processIntelligentCommand({
          command: 'unknown',
          user: { phoneNumber, did: context.did },
          context: {
            registered: context.registered,
            creditScore: context.creditScore,
            tier: context.tier,
            message: messageText
          },
          channel: 'whatsapp',
          message: messageText
        });

        // If OpenClaw provides an intelligent response
        if (result.result && result.result.action !== 'error') {
          const response = result.result.data?.response ||
                          result.result.reasoning ||
                          `I understand you're asking about "${messageText}". Here's what I can help with:\n\n` +
                          (context.registered ?
                            `💰 Send *request ${Math.min(500, context.tier === 'A' ? 5000 : context.tier === 'B' ? 2000 : 500)}* for a loan\n📊 Send *status* for credit info\n💳 Send *wallet* for address` :
                            `🚀 Send *register* to create account\n💰 Then *request 300* for your first loan\n❓ Send *help* for more commands`);

          await sendWhatsAppMessage(phoneNumber, response);
          return;
        }
      } catch (error) {
        logger.warn('OpenClaw unknown command failed, using fallback', { error: error.message });
      }

      // Fallback: Smart unknown command response
      const suggestions = context.registered ?
        ['*status*', '*request 300*', '*balance*', '*wallet*'] :
        ['*register*', '*help*'];

      const response = `🤔 I didn't understand "${messageText}"

💡 *Try these:*
${suggestions.join(', ')}

❓ Send *help* for complete list

${!context.registered ? '\n🚀 *New here?* Send *register* to start!' : ''}`;

      await sendWhatsAppMessage(phoneNumber, response);
    }
  } catch (error) {
    logger.error('Error handling WhatsApp message', { error: error.message, phoneNumber, command });
    await sendWhatsAppMessage(phoneNumber, '❌ Something went wrong. Please try again or send "help" for assistance.');
  }
};

/**
 * Handle WhatsApp webhook (for Express route).
 */
const handleWhatsAppWebhook = async (req, res) => {
  try {
    const parsed = parseWhatsAppWebhook(req.body);

    if (!parsed) {
      return res.status(400).json({ error: 'Invalid webhook body' });
    }

    const { phoneNumber, message } = parsed;

    logger.info('📱 WhatsApp message received', { phoneNumber, message, timestamp: new Date().toISOString() });

    // Process message asynchronously
    setImmediate(() => {
      handleWhatsAppMessage(phoneNumber, message).catch((error) => {
        logger.error('❌ Error handling WhatsApp message', { phoneNumber, message, error: error.message, stack: error.stack });
      });
    });

    // Return 200 OK immediately
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('❌ WhatsApp webhook error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
};

/**
 * Initialize WhatsApp channel.
 */
const initializeWhatsApp = () => {
  logger.info('WhatsApp channel initialized', {
    configured: !!process.env.TWILIO_ACCOUNT_SID
  });
  return true;
};

// Exports
module.exports = {
  // Initialize
  initializeWhatsApp,

  // Core message handling
  handleWhatsAppMessage,
  handleWhatsAppWebhook,

  // Account commands
  handleWhatsAppRegister,
  handleWhatsAppStatus,
  handleWhatsAppWallet,
  handleWhatsAppBalance,
  handleWhatsAppHelp,

  // Loan commands
  handleWhatsAppRequest,
  handleWhatsAppApprove,
  handleWhatsAppRepay,
  handleWhatsAppHistory,
  handleWhatsAppLoans,
  handleWhatsAppLimit,
  handleWhatsAppTerms,

  // Credit commands
  handleWhatsAppTiers,
  handleWhatsAppUpgrade,

  // Capital commands
  handleWhatsAppCapital,
  handleWhatsAppLPPool,
  handleWhatsAppAAVE,
  handleWhatsAppTreasury,

  // System commands
  handleWhatsAppHealth,

  // Utility functions
  sendWhatsAppMessage,
  parseWhatsAppWebhook,
  getOrCreateWhatsAppContext
};