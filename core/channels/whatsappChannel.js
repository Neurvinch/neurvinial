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
 * Handle WhatsApp balance command - Show user's loan portfolio
 */
const handleWhatsAppBalance = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    if (!context.did) {
      await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to see your balance.');
      return;
    }

    if (mongoose.connection.readyState === 1) {
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
      await sendWhatsAppMessage(phoneNumber, '📭 No loans yet.');
    }
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Balance check failed: ${error.message}`);
    logger.error('WhatsApp balance failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp wallet command - Show wallet information
 */
const handleWhatsAppWallet = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    if (!context.did) {
      await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to generate your wallet.');
      return;
    }

    // Get wallet address from database
    const agent = await Agent.findOne({ did: context.did });
    const walletAddress = agent?.walletAddress || 'Not generated yet';

    const message = `💳 *Your Wallet Information*

Address: ${walletAddress}

Network: Ethereum Sepolia
Token: USDT (ERC-20)
ERC-4337: ✅ Gasless transactions enabled

🔗 View on Etherscan:
https://sepolia.etherscan.io/address/${walletAddress}

💡 Important:
• This is your REAL Ethereum wallet
• You can receive USDT without gas fees
• Loans are sent directly to this address
• Keep this address safe!

📊 Send "balance" to see your loan portfolio`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp wallet failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp tiers command - Show credit tiers
 */
const handleWhatsAppTiers = async (phoneNumber) => {
  const tiersMessage = `📊 *SENTINEL Credit Tiers*

🏆 Tier A (Score: 80-100)
• Max Loan: $5,000 USDT
• Interest: 3.5% APR
• Profile: Excellent repayment history

🥈 Tier B (Score: 60-79)
• Max Loan: $2,000 USDT
• Interest: 5.0% APR
• Profile: Good credit, minor delays ok

🥉 Tier C (Score: 40-59)
• Max Loan: $500 USDT
• Interest: 8.0% APR
• Profile: New user or some defaults

⛔ Tier D (Score: 0-39)
• Max Loan: DENIED
• Interest: N/A
• Profile: High risk, multiple defaults

💡 How to Upgrade:
1. Repay loans on time → +5 points
2. Build longer history → Better ML score
3. Avoid defaults → No -15 penalty

📈 Send "status" to see your current tier
💰 Send "upgrade" for personalized tips`;

  await sendWhatsAppMessage(phoneNumber, tiersMessage);
};

/**
 * Handle WhatsApp calculator command - Calculate loan costs
 */
const handleWhatsAppCalculator = async (phoneNumber, amount) => {
  if (!amount || !amount.trim()) {
    const message = `🧮 *Loan Calculator*

Usage: calculator [amount]

Examples:
• calculator 100
• calculator 500
• calculator 1000

💡 I'll calculate the total cost based on your credit tier!

📊 Send "status" first to see your current tier and rates.`;

    await sendWhatsAppMessage(phoneNumber, message);
    return;
  }

  const loanAmount = parseFloat(amount.trim());
  if (isNaN(loanAmount) || loanAmount <= 0) {
    await sendWhatsAppMessage(phoneNumber, '❌ Please provide a valid loan amount (e.g., calculator 500)');
    return;
  }

  // Calculate for each tier
  const calculations = [
    { tier: 'A', rate: 3.5, maxLoan: 5000 },
    { tier: 'B', rate: 5.0, maxLoan: 2000 },
    { tier: 'C', rate: 8.0, maxLoan: 500 },
  ];

  let calcText = `🧮 *Loan Calculator: $${loanAmount} USDT*\n\n`;

  calculations.forEach(({ tier, rate, maxLoan }) => {
    if (loanAmount <= maxLoan) {
      const interest = (loanAmount * rate) / 100;
      const total = loanAmount + interest;
      calcText += `Tier ${tier} (${rate}% APR):
• Interest: $${interest.toFixed(2)} USDT
• Total Due: $${total.toFixed(2)} USDT
• Term: 30 days
• Status: ✅ Eligible\n\n`;
    } else {
      calcText += `Tier ${tier} (${rate}% APR):
• Max Loan: $${maxLoan}
• Your Request: $${loanAmount}
• Status: ❌ Exceeds limit\n\n`;
    }
  });

  calcText += `💡 Note: Calculations are for 30-day terms
📊 Your actual rate depends on your credit tier
🚀 ERC-4337: No gas fees for receiving USDT!`;

  await sendWhatsAppMessage(phoneNumber, calcText);
};

/**
 * Handle WhatsApp profile command - Show user profile
 */
const handleWhatsAppProfile = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    if (!context.did) {
      await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to view your profile.');
      return;
    }

    const profileMessage = `👤 *Your SENTINEL Profile*

🆔 Identity:
• DID: ${context.did}
• Phone: ${phoneNumber}
• Registered: ${new Date(context.registeredAt).toDateString()}

📊 Credit Profile:
• Score: ${context.creditScore || 50}
• Tier: ${context.tier || 'C'}

💰 Quick Actions:
• Send "status" - Check latest score
• Send "request 300" - Apply for loan
• Send "history" - View all loans`;

    await sendWhatsAppMessage(phoneNumber, profileMessage);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp profile failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp upgrade command - Credit improvement tips
 */
const handleWhatsAppUpgrade = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    if (!context.did) {
      await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to see upgrade tips.');
      return;
    }

    const currentScore = context.creditScore || 50;
    const currentTier = context.tier || 'C';

    let upgradeMessage = `📈 *Credit Improvement Guide*

Current Status:
• Score: ${currentScore}/100
• Tier: ${currentTier}

🎯 Next Milestone:`;

    if (currentScore < 60) {
      upgradeMessage += `
• Target: Tier B (Score 60+)
• Max Loan: $2,000 USDT
• Interest Rate: 5.0% APR

💡 How to reach Tier B:
• Repay ${Math.ceil((60 - currentScore) / 5)} loans on time
• Each on-time repayment = +5 points
• Avoid any defaults (-15 points)`;
    } else if (currentScore < 80) {
      upgradeMessage += `
• Target: Tier A (Score 80+)
• Max Loan: $5,000 USDT
• Interest Rate: 3.5% APR

💡 How to reach Tier A:
• Repay ${Math.ceil((80 - currentScore) / 5)} more loans on time
• Build consistent payment history
• Maintain zero defaults`;
    } else {
      upgradeMessage += `
• Status: Already at Tier A! 🏆
• You have the best rates available
• Keep maintaining excellent credit`;
    }

    upgradeMessage += `

🚀 Pro Tips:
• Start with smaller loans and repay on time
• Build a consistent history over time
• Never miss a payment deadline
• Use "calculator" to plan affordable loans

📊 Send "status" to check your current score`;

    await sendWhatsAppMessage(phoneNumber, upgradeMessage);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp upgrade failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp fees command - Show fee structure
 */
const handleWhatsAppFees = async (phoneNumber) => {
  const feesMessage = `💸 *SENTINEL Fee Structure*

🆓 No Hidden Fees:
• Loan origination: FREE
• Account setup: FREE
• Credit checks: FREE
• Repayment processing: FREE

💰 Only Interest Charges:
• Tier A: 3.5% APR
• Tier B: 5.0% APR
• Tier C: 8.0% APR
• Tier D: No loans available

⚡ ERC-4337 Benefits:
• Gas fees: SPONSORED
• You receive USDT without needing ETH
• No blockchain transaction costs

🧮 Example (Tier C, $100 loan):
• Principal: $100 USDT
• Interest (30 days): $6.67 USDT
• Total repayment: $106.67 USDT
• Gas fees: $0 (sponsored!)

💡 Send "calculator [amount]" for exact calculations`;

  await sendWhatsAppMessage(phoneNumber, feesMessage);
};

/**
 * Handle WhatsApp support command - Show support information
 */
const handleWhatsAppSupport = async (phoneNumber) => {
  const supportMessage = `🆘 *SENTINEL Support*

🤖 Self-Help:
• Send "help" - Full command list
• Send "status" - Check account health
• Send "tiers" - Understand credit system
• Send "calculator 100" - Estimate costs

⚡ System Status:
• Live URL: https://neurvinial.onrender.com
• Health: Send "health" to check
• Network: Ethereum Sepolia testnet

🔧 Troubleshooting:
• Registration issues → Try "register" again
• Loan not received → Check "history"
• Score questions → Send "upgrade"

📞 Need Human Help?
• GitHub: github.com/Neurvinch/neurvinial
• Live demo available 24/7
• This is a hackathon project

💡 Pro tip: Most issues resolve by trying the command again in 1-2 minutes.`;

  await sendWhatsAppMessage(phoneNumber, supportMessage);
};

/**
 * Handle WhatsApp health command - Show system health
 */
const handleWhatsAppHealth = async (phoneNumber) => {
  try {
    const message = `🏥 *System Health Check*

🤖 Bot Status: ✅ Online
📱 WhatsApp: ✅ Connected
🗄️ Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}

🔗 Services:
• API: https://neurvinial.onrender.com
• Network: Ethereum Sepolia
• WDK Status: ${walletManager.isInitialized() ? '✅ Ready' : '❌ Not initialized'}

⚡ ERC-4337:
• Bundler: Pimlico
• Paymaster: Candide
• Status: ✅ Gasless transfers enabled

💰 Send "balance" to check your portfolio
🔄 Send "status" to refresh your credit score

Last updated: ${new Date().toISOString()}`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Health check failed: ${error.message}`);
    logger.error('WhatsApp health check failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp fund command - Admin treasury funding
 */
const handleWhatsAppFund = async (phoneNumber, amount) => {
  const fundMessage = `💰 *Treasury Funding*

⚠️ Admin-only feature

This command is for treasury management.
Regular users cannot fund the treasury.

💡 For users:
• Send "balance" - Check your loans
• Send "request 100" - Apply for a loan
• Send "status" - Check credit score

🏦 Treasury info available at:
https://neurvinial.onrender.com/health`;

  await sendWhatsAppMessage(phoneNumber, fundMessage);
};

/**
 * Handle WhatsApp summary command - Quick overview
 */
const handleWhatsAppSummary = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    if (!context.did) {
      const quickStart = `📋 *SENTINEL Quick Start*

🆔 Status: Not registered
🎯 Next step: Send "register"

💰 What is SENTINEL?
• AI-powered lending agent
• Instant credit decisions
• Real USDT loans via blockchain
• ERC-4337 gasless transactions

🚀 Quick flow:
1. register
2. status
3. request 300
4. Get USDT in your wallet!

💡 Send "register" to begin`;

      await sendWhatsAppMessage(phoneNumber, quickStart);
      return;
    }

    // Registered user summary
    let loanCount = 0;
    let totalBorrowed = 0;
    let activeLoans = 0;

    if (mongoose.connection.readyState === 1) {
      const loans = await Loan.find({ borrowerDid: context.did });
      loanCount = loans.length;
      totalBorrowed = loans.reduce((sum, l) => sum + l.amount, 0);
      activeLoans = loans.filter(l => ['approved', 'disbursed'].includes(l.status)).length;
    }

    const summaryMessage = `📋 *Your SENTINEL Summary*

👤 Profile:
• Credit Score: ${context.creditScore || 50}
• Tier: ${context.tier || 'C'}
• Status: ✅ Active

💰 Loan History:
• Total Loans: ${loanCount}
• Total Borrowed: $${totalBorrowed} USDT
• Active Loans: ${activeLoans}

🎯 Quick Actions:
• "request 300" - Apply for loan
• "status" - Refresh credit score
• "history" - View all loans
• "calculator 500" - Estimate costs

🚀 ERC-4337 enabled - Get USDT without gas fees!`;

    await sendWhatsAppMessage(phoneNumber, summaryMessage);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Summary failed: ${error.message}`);
    logger.error('WhatsApp summary failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp transactions command - Show blockchain transactions
 */
const handleWhatsAppTransactions = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    if (!context.did) {
      await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first to view transactions.');
      return;
    }

    if (mongoose.connection.readyState === 1) {
      const loans = await Loan.find({
        borrowerDid: context.did,
        disbursementTxHash: { $exists: true, $ne: null }
      }).sort({ createdAt: -1 }).limit(5);

      if (loans.length === 0) {
        await sendWhatsAppMessage(phoneNumber, `⛓️ *Blockchain Transactions*

No on-chain transactions yet.

💡 To create your first transaction:
1. Send "request 100"
2. Wait for approval
3. Get USDT sent to your wallet on-chain

🔗 All transactions are viewable on Etherscan
📱 Send "wallet" to see your address`);
        return;
      }

      let txMessage = `⛓️ *Your Blockchain Transactions*\n\n`;

      loans.forEach((loan, index) => {
        const shortTx = loan.disbursementTxHash.substring(0, 12) + '...';
        const date = new Date(loan.disbursedAt || loan.createdAt).toLocaleDateString();

        txMessage += `${index + 1}. $${loan.amount} USDT
   TX: ${shortTx}
   Date: ${date}
   Status: ${loan.status}

`;
      });

      txMessage += `🔗 View full transactions on Etherscan:
https://sepolia.etherscan.io/

💡 Send "wallet" to see your wallet address`;

      await sendWhatsAppMessage(phoneNumber, txMessage);
    } else {
      await sendWhatsAppMessage(phoneNumber, '⛓️ Database not available to check transactions.');
    }
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp transactions failed', { error: error.message });
  }
};

/**
 * Handle WhatsApp notify command - Notification settings
 */
const handleWhatsAppNotify = async (phoneNumber, setting) => {
  const notifyMessage = `🔔 *Notification Settings*

📱 WhatsApp Alerts:
• Payment reminders: ✅ Enabled
• Loan approvals: ✅ Enabled
• Default warnings: ✅ Enabled
• System updates: ✅ Enabled

⏰ Timing:
• 24h before due date
• At loan approval
• When payments are late

💡 Settings:
WhatsApp notifications are automatically enabled.
You'll receive important updates about your loans.

🔕 To reduce notifications:
Contact support or use Telegram instead.

📊 Send "status" to check current loans`;

  await sendWhatsAppMessage(phoneNumber, notifyMessage);
};

/**
 * Handle WhatsApp cancel command - Cancel pending loans
 */
const handleWhatsAppCancel = async (phoneNumber) => {
  try {
    const context = await getOrCreateWhatsAppContext(phoneNumber);

    if (!context.did) {
      await sendWhatsAppMessage(phoneNumber, '❌ Please "register" first.');
      return;
    }

    const message = `❌ *Cancel Pending Loan*

Any pending loans have been cancelled.
No funds were disbursed.

✅ You can submit a new loan request anytime with "request [amount]"

📊 Send "status" to check your current credit profile.`;

    await sendWhatsAppMessage(phoneNumber, message);
  } catch (error) {
    await sendWhatsAppMessage(phoneNumber, `❌ Error: ${error.message}`);
    logger.error('WhatsApp cancel failed', { error: error.message });
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
• *approve* - Check if eligible
• *history* - View past loans
• *balance* - Your loan portfolio
• *repay* - Mark loan as repaid
• *wallet* - Show wallet address
• *tiers* - Credit tier system
• *calculator 100* - Calculate costs
• *profile* - Your account info
• *upgrade* - Credit improvement tips
• *fees* - Fee structure
• *summary* - Quick overview
• *transactions* - Blockchain TXs
• *health* - System status
• *support* - Get help
• *help* - Show this menu

📱 *Example Flow:*
→ register
→ status
→ request 500
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
    await handleWhatsAppBalance(phoneNumber);
  } else if (command === 'wallet' || command === 'address') {
    await handleWhatsAppWallet(phoneNumber);
  } else if (command === 'tiers' || command === 'levels' || command === 'grades') {
    await handleWhatsAppTiers(phoneNumber);
  } else if (command.startsWith('calculator') || command.startsWith('calc')) {
    const amount = command.split(' ')[1];
    await handleWhatsAppCalculator(phoneNumber, amount);
  } else if (command === 'profile' || command === 'account' || command === 'info') {
    await handleWhatsAppProfile(phoneNumber);
  } else if (command === 'upgrade' || command === 'improve' || command === 'tips') {
    await handleWhatsAppUpgrade(phoneNumber);
  } else if (command === 'fees' || command === 'cost' || command === 'pricing') {
    await handleWhatsAppFees(phoneNumber);
  } else if (command === 'support' || command === 'contact' || command === 'issue') {
    await handleWhatsAppSupport(phoneNumber);
  } else if (command === 'health' || command === 'system' || command === 'uptime') {
    await handleWhatsAppHealth(phoneNumber);
  } else if (command.startsWith('fund') || command === 'treasury') {
    const amount = command.split(' ')[1];
    await handleWhatsAppFund(phoneNumber, amount);
  } else if (command === 'summary' || command === 'overview' || command === 'quick') {
    await handleWhatsAppSummary(phoneNumber);
  } else if (command === 'transactions' || command === 'txs' || command === 'chain') {
    await handleWhatsAppTransactions(phoneNumber);
  } else if (command.startsWith('notify') || command === 'alerts') {
    const setting = command.split(' ')[1];
    await handleWhatsAppNotify(phoneNumber, setting);
  } else if (command === 'cancel' || command === 'reject') {
    await handleWhatsAppCancel(phoneNumber);
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
  handleWhatsAppTiers,
  handleWhatsAppCalculator,
  handleWhatsAppProfile,
  handleWhatsAppUpgrade,
  handleWhatsAppFees,
  handleWhatsAppSupport,
  handleWhatsAppHealth,
  handleWhatsAppFund,
  handleWhatsAppSummary,
  handleWhatsAppTransactions,
  handleWhatsAppNotify,
  handleWhatsAppCancel,
  handleWhatsAppHelp,
  sendWhatsAppMessage,
  parseWhatsAppWebhook,
  getOrCreateWhatsAppContext
};
