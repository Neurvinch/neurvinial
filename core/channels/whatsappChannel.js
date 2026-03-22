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

        // Get user's wallet address from Agent record
        let recipientAddress = context.walletAddress;
        if (!recipientAddress) {
          const agent = await Agent.findOne({ did: context.did });
          recipientAddress = agent?.walletAddress;
        }

        // Attempt REAL USDT transfer
        let txHash = null;
        let transferSuccess = false;
        let transferError = null;

        if (recipientAddress && walletManager.isInitialized()) {
          try {
            logger.info('Initiating REAL USDT transfer', {
              to: recipientAddress,
              amount: parsedAmount,
              did: context.did
            });

            const transferResult = await walletManager.sendUSDT(recipientAddress, parsedAmount);
            txHash = transferResult.hash;
            transferSuccess = true;

            logger.info('USDT transfer SUCCESS', {
              txHash,
              amount: parsedAmount,
              to: recipientAddress
            });
          } catch (txError) {
            transferError = txError.message;
            logger.warn('USDT transfer failed', {
              error: txError.message,
              to: recipientAddress,
              amount: parsedAmount
            });
          }
        }

        // Generate unique loan ID
        const loanId = `LOAN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const loan = new Loan({
          loanId,
          borrowerDid: context.did,
          amount: parsedAmount,
          currency: 'USDT',
          apr: interestRate,
          dueDate,
          status: transferSuccess ? 'disbursed' : 'approved',
          tier: context.tier,
          disbursementTxHash: txHash,
          disbursedAt: transferSuccess ? new Date() : null,
          decisionReasoning: result.result.reasoning || 'Approved based on credit tier'
        });

        await loan.save();
        logger.info('Loan saved to database', {
          did: context.did,
          amount: parsedAmount,
          loanId: loan._id,
          txHash,
          transferSuccess
        });

        // Build confirmation message
        let message;
        if (transferSuccess && txHash) {
          message = `✅ *Loan Approved & Disbursed!*

💰 Amount: $${parsedAmount} USDT
📊 Interest Rate: ${(interestRate * 100).toFixed(1)}% per year
⏰ Duration: 30 days
📅 Due Date: ${dueDate.toLocaleDateString()}

🔗 *Transaction Confirmed*
TX Hash: ${txHash.substring(0, 16)}...
Network: Ethereum Sepolia
Status: ✅ Sent to your wallet

📊 Loan ID: ${loan._id.toString().substring(0, 8)}...

💡 View on Etherscan:
https://sepolia.etherscan.io/tx/${txHash}`;
        } else {
          // Approved but transfer failed or not initialized
          const reason = transferError || 'WDK not initialized';
          message = `✅ *Loan Approved!*

💰 Amount: $${parsedAmount} USDT
📊 Interest Rate: ${(interestRate * 100).toFixed(1)}% per year
⏰ Duration: 30 days
📅 Due Date: ${dueDate.toLocaleDateString()}

⚠️ *Disbursement Pending*
Reason: ${reason}
Your wallet: ${recipientAddress ? recipientAddress.substring(0, 10) + '...' : 'Not set'}

📊 Loan ID: ${loan._id.toString().substring(0, 8)}...
Status: ⏳ Awaiting disbursement

💡 Treasury needs ETH for gas. Contact admin.`;
        }

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
      const loans = await Loan.find({ borrowerDid: context.did }).sort({ createdAt: -1 }).limit(10);

      if (loans.length === 0) {
        await sendWhatsAppMessage(phoneNumber, '📭 *Loan History*\n\nNo loans yet. Send "request 300" to apply!');
        return;
      }

      let history = '📚 *Your Loan History* (' + loans.length + ' loans)\n\n';
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

    // If no loan ID provided, show list of loans to repay
    if (!loanIdPart) {
      let msg = '💳 *Select Loan to Repay*\n\n';
      activeLoans.forEach((loan, index) => {
        const shortId = loan.loanId ? loan.loanId.substring(0, 12) : loan._id.toString().substring(0, 8);
        msg += `${index + 1}. $${loan.amount} USDT (${shortId})\n`;
      });
      msg += '\nTo repay, send: *repay [loan-id]*\n';
      msg += `Example: repay ${activeLoans[0].loanId ? activeLoans[0].loanId.substring(0, 8) : activeLoans[0]._id.toString().substring(0, 8)}`;

      await sendWhatsAppMessage(phoneNumber, msg);
      return;
    }

    // Find the specific loan
    const loan = activeLoans.find(l =>
      (l.loanId && l.loanId.includes(loanIdPart)) ||
      l._id.toString().includes(loanIdPart)
    );

    if (!loan) {
      await sendWhatsAppMessage(phoneNumber, `❌ Loan "${loanIdPart}" not found. Send "repay" to see your active loans.`);
      return;
    }

    // Mark as repaid
    loan.status = 'repaid';
    loan.repaidAt = new Date();
    await loan.save();

    // Update user's credit score (improve for good repayment)
    const agent = await Agent.findOne({ did: context.did });
    if (agent) {
      agent.totalRepaid = (agent.totalRepaid || 0) + 1;
      // Improve credit score slightly (max 100)
      agent.creditScore = Math.min(100, (agent.creditScore || 50) + 5);
      // Potentially upgrade tier
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

    const message = `✅ *Loan Repaid!*

💰 Amount: $${loan.amount} USDT
📅 Repaid: ${new Date().toLocaleDateString()}
📊 Loan ID: ${loan.loanId || loan._id.toString().substring(0, 12)}

🎉 *Credit Score Improved!*
New Score: ${agent?.creditScore || 'N/A'}
New Tier: ${agent?.tier || 'N/A'}

Keep repaying on time to improve your credit!`;

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
• *balance* - Your loan portfolio
• *repay* - Mark loan as repaid
• *help* - Show this menu

📱 *Example Flows:*
→ register
→ status
→ request 500
→ repay [loan-id]

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
  } else if (command.startsWith('repay')) {
    const loanId = command.split(' ')[1];
    await handleWhatsAppRepay(phoneNumber, loanId);
  } else if (command === 'balance') {
    try {
      // Get user context first
      const context = await getOrCreateWhatsAppContext(phoneNumber);

      if (!context.did) {
        await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to see your balance.');
        return;
      }

      if (mongoose.connection.readyState === 1) {
        // Show user's loan portfolio (not treasury)
        const loans = await Loan.find({ borrowerDid: context.did });

        const activeLoans = loans.filter(l => ['approved', 'disbursed'].includes(l.status));
        const repaidLoans = loans.filter(l => l.status === 'repaid');
        const totalBorrowed = loans.reduce((sum, l) => sum + l.amount, 0);
        const totalRepaid = repaidLoans.reduce((sum, l) => sum + l.amount, 0);
        const activeLoanTotal = activeLoans.reduce((sum, l) => sum + l.amount, 0);

        // Get wallet address
        const agent = await Agent.findOne({ did: context.did });
        const walletAddress = agent?.walletAddress || 'Not set';
        const shortWallet = walletAddress.length > 20
          ? `${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}`
          : walletAddress;

        const message = `💰 *Your Loan Portfolio*

📊 Total Borrowed: $${totalBorrowed} USDT
✅ Total Repaid: $${totalRepaid} USDT
⏳ Active Loans: $${activeLoanTotal} USDT
📈 Loan Count: ${loans.length}

🔄 Active: ${activeLoans.length} loans
✓ Completed: ${repaidLoans.length} loans

🔐 Your Wallet: ${shortWallet}

Send "history" to see all loans`;

        await sendWhatsAppMessage(phoneNumber, message);
      } else {
        // Fallback to treasury info if DB not connected
        const ethBal = await walletManager.getSentinelETHBalance();
        const usdtBal = await walletManager.getSentinelUSDTBalance();

        const message = `💰 *Sentinel Treasury*\n\nETH: ${ethBal.balance}\nUSDT: ${usdtBal.balance}`;
        await sendWhatsAppMessage(phoneNumber, message);
      }
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
  handleWhatsAppRepay,
  handleWhatsAppHelp,
  sendWhatsAppMessage,
  parseWhatsAppWebhook,
  getOrCreateWhatsAppContext
};
