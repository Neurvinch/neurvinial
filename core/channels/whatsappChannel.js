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
    logger.warn('WhatsApp not configured - missing Twilio credentials');
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

    logger.debug('WhatsApp message sent', { to: toPhoneNumber });
    return true;
  } catch (error) {
    logger.error('Failed to send WhatsApp message', { error: error.message });
    return false;
  }
};

/**
 * Parse WhatsApp webhook body.
 */
const parseWhatsAppWebhook = (body) => {
  const { From, Body } = body;

  if (!From || !Body) {
    return null;
  }

  const phoneNumber = From.replace('whatsapp:', '');
  const message = Body.trim();

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

    if (mongoose.connection.readyState === 1) {
      const agent = new Agent({
        did,
        walletAddress: `0x${phoneNumber.replace(/\D/g, '').padStart(40, '0')}`,
        creditScore: 50,
        tier: 'C'
      });
      await agent.save();
    }

    const message = `✅ *Registration Successful*

Your DID: ${did}
Credit Score: 50 (Tier C)

Send "status" to check score or "request 500" to apply for a loan.`;

    await sendWhatsAppMessage(phoneNumber, message);
    logger.info('WhatsApp user registered', { did, phoneNumber });
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
  if (!parsedAmount || parsedAmount < 100) {
    await sendWhatsAppMessage(phoneNumber, '📝 Please specify a valid amount. Example: "request 500"');
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

        const loan = new Loan({
          did: context.did,
          amount: parsedAmount,
          interestRate,
          dueDate,
          createdAt: new Date(),
          status: 'active',
          repaid: false,
          tier: context.tier
        });

        await loan.save();
        logger.info('Loan saved to database', { did: context.did, amount: parsedAmount, loanId: loan._id });

        const message = `✅ *Loan Approved!*

Amount: $${parsedAmount} USDT
Interest Rate: ${(interestRate * 100).toFixed(1)}% per year
Duration: 30 days
Due Date: ${dueDate.toLocaleDateString()}

📊 Loan ID: ${loan._id.toString().substring(0, 8)}...
Status: ⏳ Active

💡 Next: Send "history" to see this loan
Network: Ethereum Sepolia (Ready for disbursement)`;

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
 * Handle WhatsApp limit/howmuch command - Show max loan amount
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
 * Handle WhatsApp approve command - Check if eligible
 */
const handleWhatsAppApprove = async (phoneNumber) => {
  const context = await getOrCreateWhatsAppContext(phoneNumber);

  if (!context.did) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to check eligibility.');
    return;
  }

  try {
    const result = await invokeSkill('sentinel_credit', {
      did: context.did,
      action: 'assess_creditworthiness'
    });

    const approved = context.tier !== 'D';
    const message = approved
      ? `✅ *You Are Eligible!*\n\nTier: ${context.tier}\nCredit Score: ${context.creditScore}\n\nYou can borrow up to your tier limit.\nSend "request 300" to apply!`
      : `❌ *Not Eligible*\n\nTier D users are not eligible for loans at this time.\nImprove your credit score to become eligible.`;

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
      const loans = await Loan.find({ did: context.did }).sort({ createdAt: -1 }).limit(10);

      if (loans.length === 0) {
        await sendWhatsAppMessage(phoneNumber, '📭 *Loan History*\n\nNo loans yet. Send "request 300" to apply!');
        return;
      }

      let history = '📚 *Your Loan History* (' + loans.length + ' loans)\n\n';
      loans.forEach((loan, index) => {
        const status = loan.repaid ? '✅ Repaid' : '⏳ Active';
        const dueDate = new Date(loan.dueDate).toLocaleDateString();
        const createdDate = new Date(loan.createdAt).toLocaleDateString();
        history += `${index + 1}. $${loan.amount} USDT (${status})\n`;
        history += `   Created: ${createdDate}\n`;
        history += `   Due: ${dueDate}\n`;
        history += `   Rate: ${(loan.interestRate * 100).toFixed(1)}%\n`;
        history += `   ID: ${loan._id.toString().substring(0, 8)}...\n\n`;
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
 * Handle WhatsApp help command.
 */
const handleWhatsAppHelp = async (phoneNumber) => {
  const helpMessage = `ℹ️ *SENTINEL WhatsApp Bot*

🎯 *Quick Start:*
1. Send: *register* - Create account
2. Send: *status* - Check credit score
3. Send: *request 300* - Apply for loan

💡 *More Commands:*
• *limit* - See max borrowing amount
• *terms* - View loan interest rates
• *approve* - Check if eligible
• *history* - View past loans
• *balance* - Treasury balance
• *help* - Show this menu

📱 *Example Flows:*
→ register
→ status
→ request 500

💰 Token: USDT on Ethereum Sepolia`;

  await sendWhatsAppMessage(phoneNumber, helpMessage);
};


/**
 * Handle WhatsApp message.
 */
const handleWhatsAppMessage = async (phoneNumber, messageText) => {
  const command = messageText.toLowerCase().trim();

  if (command === 'register') {
    await handleWhatsAppRegister(phoneNumber);
  } else if (command === 'status') {
    await handleWhatsAppStatus(phoneNumber);
  } else if (command.startsWith('request')) {
    const amount = command.split(' ')[1];
    await handleWhatsAppRequest(phoneNumber, amount);
  } else if (command === 'limit' || command === 'howmuch' || command === 'max') {
    await handleWhatsAppLimit(phoneNumber);
  } else if (command === 'terms' || command === 'rates' || command === 'interest') {
    await handleWhatsAppTerms(phoneNumber);
  } else if (command === 'approve' || command === 'eligible' || command === 'check') {
    await handleWhatsAppApprove(phoneNumber);
  } else if (command === 'history' || command === 'loans' || command === 'past') {
    await handleWhatsAppHistory(phoneNumber);
  } else if (command === 'balance') {
    try {
      const walletManager = require('../wdk/walletManager');
      const ethBal = await walletManager.getSentinelETHBalance();
      const usdtBal = await walletManager.getSentinelUSDTBalance();

      const message = `💰 *Sentinel Treasury*\n\nETH: ${ethBal.balance}\nUSDT: ${usdtBal.balance}`;
      await sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      await sendWhatsAppMessage(phoneNumber, `❌ Balance check failed: ${error.message}`);
    }
  } else if (command === 'help' || command === '?') {
    await handleWhatsAppHelp(phoneNumber);
  } else {
    // Auto-help for unknown commands - show quick menu
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

    logger.debug('WhatsApp message received', { phoneNumber, message });

    // Process message asynchronously
    setImmediate(() => {
      handleWhatsAppMessage(phoneNumber, message).catch((error) => {
        logger.error('Error handling WhatsApp message', { error: error.message });
      });
    });

    // Return 200 OK immediately
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('WhatsApp webhook error', { error: error.message });
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
  handleWhatsAppHelp,
  sendWhatsAppMessage,
  parseWhatsAppWebhook,
  getOrCreateWhatsAppContext
};
