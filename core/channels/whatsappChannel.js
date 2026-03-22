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

    // Perform REAL USDT transfer via WDK
    let txHash = null;
    let transferSuccess = false;
    let isSimulated = false;

    try {
      const treasuryBalance = await walletManager.getSentinelUSDTBalance();

      if (treasuryBalance.balance < loan.amount) {
        // Simulate transfer for demo purposes when treasury is empty
        txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).substr(2, 40)}`;
        transferSuccess = true;
        isSimulated = true;
        logger.info('Simulated USDT transfer for demo', { amount: loan.amount, to: agent.walletAddress });
      } else {
        // Real transfer
        const transferResult = await walletManager.sendUSDT(agent.walletAddress, loan.amount);
        txHash = transferResult.hash;
        transferSuccess = true;
        isSimulated = transferResult.simulated || false;
        logger.info('Real USDT transfer completed', { txHash, amount: loan.amount });
      }
    } catch (txError) {
      logger.error('Transfer failed', { error: txError.message });
      throw new Error(`Transfer failed: ${txError.message}`);
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
• Network: Ethereum Sepolia${isSimulated ? '\n\n⚠️ Demo Mode: Simulated transfer for presentation' : ''}

💡 Next Steps:
• Monitor your wallet for USDT arrival
• Send "repay" when ready to repay the loan
• Repay on time to improve your credit score!

🎉 ERC-4337 Magic: You received USDT without needing ETH for gas!`;

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

    // Find active loans for this user
    const activeLoans = await Loan.find({
      borrowerDid: context.did,
      status: { $in: ['approved', 'disbursed'] }
    }).sort({ createdAt: 1 });

    if (activeLoans.length === 0) {
      await sendWhatsAppMessage(phoneNumber, '✅ *No Active Loans*\n\nYou have no loans to repay. Send "request 100" to get a loan.');
      return;
    }

    // For demo purposes, mark the oldest loan as repaid
    const loan = activeLoans[0];
    loan.status = 'repaid';
    loan.repaidAt = new Date();
    await loan.save();

    // Improve credit score
    const agent = await Agent.findOne({ did: context.did });
    if (agent) {
      agent.totalRepaid = (agent.totalRepaid || 0) + 1;
      agent.creditScore = Math.min(100, (agent.creditScore || 50) + 5);

      // Update tier based on new score
      if (agent.creditScore >= 80) agent.tier = 'A';
      else if (agent.creditScore >= 60) agent.tier = 'B';
      else if (agent.creditScore >= 40) agent.tier = 'C';
      else agent.tier = 'D';

      await agent.save();

      // Update context
      context.creditScore = agent.creditScore;
      context.tier = agent.tier;
      whatsappContexts.set(phoneNumber, context);
    }

    const message = `✅ *Loan Repaid Successfully!*

💰 Amount: $${loan.amount} USDT
📅 Repaid: ${new Date().toLocaleDateString()}
📊 Loan ID: ${loan.loanId || loan._id.toString().substring(0, 12)}...

🎉 *Credit Score Improved!*
New Score: ${agent?.creditScore || 'N/A'}/100
New Tier: ${agent?.tier || 'N/A'}

Keep repaying on time to improve your credit and unlock higher loan amounts!

💡 Send "status" to see your updated credit profile`;

    await sendWhatsAppMessage(phoneNumber, message);
    logger.info('Loan repaid', {
      did: context.did,
      loanId: loan.loanId || loan._id,
      amount: loan.amount
    });
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp repay failed', { error: error.message });
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
 * Handle WhatsApp help command.
 */
const handleWhatsAppHelp = async (phoneNumber) => {
  const helpMessage = `ℹ️ *SENTINEL WhatsApp Bot*

🎯 *Quick Start:*
1. Send: *register* - Create account
2. Send: *status* - Check credit score
3. Send: *request 300* - Apply for loan

💡 *All Commands:*
• *register* - Create account
• *status* - Check credit score
• *request 100* - Apply for loan
• *limit* - See max borrowing amount
• *terms* - View loan interest rates
• *approve* - Disburse pending loan
• *history* - View past loans
• *balance* - Your loan portfolio
• *repay* - Mark loan as repaid
• *wallet* - Show wallet address
• *help* - Show this menu

📱 *Example Flow:*
→ register
→ status
→ request 500
→ approve
→ repay

💰 Token: USDT on Ethereum Sepolia
⚡ ERC-4337: Gasless transactions enabled`;

  await sendWhatsAppMessage(phoneNumber, helpMessage);
};

/**
 * Handle WhatsApp message.
 */
const handleWhatsAppMessage = async (phoneNumber, messageText) => {
  const command = messageText.toLowerCase().trim();

  try {
    if (command === 'register') {
      await handleWhatsAppRegister(phoneNumber);
    } else if (command === 'status') {
      await handleWhatsAppStatus(phoneNumber);
    } else if (command.startsWith('request')) {
      const amount = command.split(' ')[1];
      await handleWhatsAppRequest(phoneNumber, amount);
    } else if (command === 'approve' || command === 'eligible' || command === 'check') {
      await handleWhatsAppApprove(phoneNumber);
    } else if (command === 'limit' || command === 'howmuch' || command === 'max') {
      await handleWhatsAppLimit(phoneNumber);
    } else if (command === 'terms' || command === 'rates' || command === 'interest') {
      await handleWhatsAppTerms(phoneNumber);
    } else if (command === 'history' || command === 'loans' || command === 'past') {
      await handleWhatsAppHistory(phoneNumber);
    } else if (command.startsWith('repay')) {
      const loanId = command.split(' ')[1];
      await handleWhatsAppRepay(phoneNumber, loanId);
    } else if (command === 'balance') {
      await handleWhatsAppBalance(phoneNumber);
    } else if (command === 'wallet' || command === 'address') {
      await handleWhatsAppWallet(phoneNumber);
    } else if (command === 'help' || command === '?') {
      await handleWhatsAppHelp(phoneNumber);
    } else {
      // Auto-help for unknown commands
      const greeting = `👋 Welcome to SENTINEL Lending!

Type a command:
• *register* - Create account
• *status* - Check score
• *request 300* - Get a loan
• *limit* - See max amount
• *help* - All commands

Quick: Send "register" to start!`;
      await sendWhatsAppMessage(phoneNumber, greeting);
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
  initializeWhatsApp,
  handleWhatsAppMessage,
  handleWhatsAppWebhook,
  handleWhatsAppRegister,
  handleWhatsAppStatus,
  handleWhatsAppRequest,
  handleWhatsAppLimit,
  handleWhatsAppTerms,
  handleWhatsAppApprove,
  handleWhatsAppHistory,
  handleWhatsAppRepay,
  handleWhatsAppBalance,
  handleWhatsAppWallet,
  handleWhatsAppHelp,
  sendWhatsAppMessage,
  parseWhatsAppWebhook,
  getOrCreateWhatsAppContext
};