# Sentinel 🏦

**Autonomous AI Lending Agent for the Agent Economy**

Built for **Tether Hackathon Galactica · WDK Edition 1 · Lending Bot Track**

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)]() [![Coverage](https://img.shields.io/badge/coverage-85%25-green)]() [![WDK](https://img.shields.io/badge/WDK-v1.0.0--beta.8-blue)]()

---

## 🎯 What Is Sentinel?

Sentinel gives AI agents a **credit identity** and a **trustless way to borrow USD₮** for computational resources, API access, or agent-to-agent transactions. **No human in the loop.**

### The Agent Economy Problem

In 2026, autonomous AI agents need to transact with each other. Traditional credit systems require:
- Social security numbers (agents don't have them)
- Bank accounts (agents can't open them)
- Human intervention for approvals (defeats the purpose of autonomy)

### Sentinel's Solution

1. **Agent registers a DID** (Decentralized Identity) with Sentinel
2. **Hybrid credit scoring**: ML model (60%) + LLM reasoning (40%)
3. **Autonomous approve/deny** with risk-adjusted terms
4. **WDK executes USD₮ transfer** on-chain (Ethereum Sepolia testnet)
5. **Repayment monitor** tracks deadlines, sends Telegram alerts, auto-defaults
6. **Credit score updates** on every repayment or default
7. **ERC-4337 support** for gasless transactions (bonus feature)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SENTINEL ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Borrower    │────▶│   Sentinel   │────▶│  Ethereum    │
│   Agent      │     │     API      │     │   Sepolia    │
│  (External)  │     │   :3000      │     │  (Testnet)   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                      ▲
                            │                      │
                            ▼                      │
                     ┌──────────────┐              │
                     │   MongoDB    │              │
                     │    Atlas     │              │
                     └──────────────┘              │
                            │                      │
                            ▼                      │
           ┌────────────────┬────────────────┐    │
           │                │                │    │
    ┌──────▼──────┐  ┌──────▼──────┐ ┌──────▼────▼──┐
    │  ML Scorer  │  │ LLM Scorer  │ │ WDK Wallet  │
    │  (Pure JS)  │  │   (Groq)    │ │   Manager   │
    └─────────────┘  └─────────────┘ └─────────────┘
           │                │                │
           └────────────────┴────────────────┘
                            │
                     ┌──────▼──────┐
                     │  OpenClaw   │
                     │   Skills    │
                     └─────────────┘
```

### Information Flow

```
REQUEST → IDENTITY → SCORE → DECISION → EXECUTION → MONITOR → SETTLE

┌─────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌───────────┐
│Borrower │─▶│DID Check │─▶│ML + LLM│─▶│Approve/  │─▶│WDK Sends  │
│ Request │  │ Registry │  │Scoring │  │Deny Logic│  │USD₮ On-Chainr
└─────────┘  └──────────┘  └────────┘  └──────────┘  └───────────┘
                                                             │
              ┌──────────────────────────────────────────────┘
              │
              ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │   Monitor    │─▶│T-24h Telegram│─▶│Default/Repay │
      │   Daemon     │  │   Reminder   │  │   Handler    │
      └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **MongoDB Atlas Account** (free tier works fine)
- **Telegram Bot Token** (get from [@BotFather](https://t.me/botfather))
- **Groq API Key** (free at [groq.com](https://groq.com))
- **Sepolia Testnet USDT** (get from [Pimlico Faucet](https://faucet.pimlico.io))

### Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd neurvinial

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env

# 4. Edit .env with your keys
nano .env  # or use your editor

# 5. Run tests (optional, no .env needed for tests)
npm test

# 6. Start Sentinel
npm start
# or for development with auto-reload:
npm run dev
```

### Environment Variables

Edit `.env` with your configuration:

```env
# MongoDB (REQUIRED)
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/sentinel

# WDK Configuration (REQUIRED for testnet)
WDK_SEED_PHRASE=your twelve word mnemonic seed phrase here
WDK_BLOCKCHAIN=ethereum
WDK_NETWORK=sepolia
WDK_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY

# API Security
API_KEYS=sentinel_demo_key_2026,your_production_key_here

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=your_chat_id_here

# LLM (Groq - Optional but recommended)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

---

## 📡 API Reference

All endpoints require API authentication via `x-api-key` header or `Authorization: Bearer <key>`.

### Agent Management

#### Register Agent
```bash
POST /agents/register
Content-Type: application/json
x-api-key: sentinel_demo_key_2026

{
  "did": "did:ethr:0x1234567890abcdef"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "did": "did:ethr:0x1234567890abcdef",
    "walletAddress": "0xABC...",
    "creditScore": 50,
    "tier": "C",
    "registeredAt": "2026-03-21T10:30:00.000Z"
  }
}
```

#### Get Credit Score
```bash
GET /agents/:did/score
x-api-key: sentinel_demo_key_2026
```

### Loan Lifecycle

#### Request Loan
```bash
POST /loans/request
Content-Type: application/json
x-api-key: sentinel_demo_key_2026

{
  "did": "did:ethr:0x1234...",
  "amount": 500,
  "purpose": "GPU compute for model training"
}
```

**Response (Approved):**
```json
{
  "success": true,
  "data": {
    "decision": "approved",
    "loanId": "550e8400-e29b-41d4-a716-446655440000",
    "terms": {
      "amount": 500,
      "apr": 18,
      "durationDays": 30,
      "collateral": 250,
      "totalDue": 507.40,
      "dueDate": "2026-04-20T10:30:00.000Z",
      "tier": "C"
    },
    "scoring": {
      "mlScore": 48,
      "llmScore": 52,
      "combinedScore": 50,
      "defaultProbability": 0.52,
      "tier": "C",
      "reasoning": "Limited history, moderate risk"
    }
  }
}
```

#### Disburse Loan
```bash
POST /loans/:loanId/disburse
x-api-key: sentinel_demo_key_2026
```

**Response:**
```json
{
  "success": true,
  "data": {
    "loanId": "550e8400-...",
    "txHash": "0xabc123...",
    "amount": 500,
    "fee": "0.002",
    "status": "disbursed"
  }
}
```

#### Repay Loan
```bash
POST /loans/:loanId/repay
Content-Type: application/json
x-api-key: sentinel_demo_key_2026

{
  "repaymentTxHash": "0xdef456..."  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "loanId": "550e8400-...",
    "status": "repaid",
    "wasOnTime": true,
    "creditScoreChange": +5,
    "newCreditScore": 55,
    "newTier": "C"
  }
}
```

### Capital Management

#### Get Capital Status
```bash
GET /capital/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reserves": {
      "usdt": 5000,
      "eth": 0.5
    },
    "deployed": {
      "activeLoans": 3,
      "totalLent": 1500
    },
    "idle": 3500
  }
}
```

---

## 🎯 Risk Tiers & Credit Scoring

### Tier System

| Tier | Credit Score | APR  | Max Loan   | Collateral | AutoDefault          |
|------|-------------|------|------------|------------|----------------------|
| **A** — Prime | 80–100 | 4%   | 10,000 USD₮ | None       | Never                |
| **B** — Standard | 60–79  | 9%   | 3,000 USD₮  | 25%        | 3rd default          |
| **C** — Subprime | 40–59  | 18%  | 500 USD₮    | 50%        | 3rd default          |
| **D** — Denied   | 0–39   | —    | 0          | —          | Immediate blacklist   |

### Scoring Formula

```
Combined Score = (ML Score × 0.6) + (LLM Score × 0.4)

ML Features (Logistic Regression):
  1. on_time_rate   (0.0-1.0)
  2. loan_frequency (count in 90 days)
  3. avg_duration   (days)
  4. collateral_ratio (0.0-1.0)
  5. tx_velocity    (transactions in 30 days)
  6. wallet_age_days (days since creation)

LLM Features (Groq/Fallback):
  - Loan purpose analysis
  - DID reputation
  - Transaction pattern reasoning
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Unit tests only (no database needed)
npm run test:unit

# Integration tests
npm run test:integration

# Watch mode
npm test -- --watch
```

### Test Coverage

- **Unit Tests**: 18 tests covering ML scoring, tier calculation, API auth, validation schemas
- **Integration Tests**: 12 tests covering full loan lifecycle
- **Total**: 30 tests, 100% passing

---

## 🔐 Security Features

### API Authentication
- API key-based authentication via `x-api-key` header or `Authorization: Bearer`
- Multiple API keys supported (comma-separated in .env)
- Rate limiting on all endpoints (100 requests/15 minutes)

### Input Validation
- Joi schema validation on all incoming requests
- DID format validation (W3C standard)
- Amount bounds checking (1-100,000 USD₮)
- Transaction hash validation (Ethereum format)

### WDK Security
- Seed phrases never logged or exposed in responses
- Private keys stored in memory only
- Graceful degradation to simulation mode if seed missing

---

## 🌟 Advanced Features

### ERC-4337 Account Abstraction (Bonus Feature)

Sentinel supports **gasless transactions** via ERC-4337:

```javascript
const erc4337 = require('./core/wdk/erc4337Manager');

// Initialize (requires bundler/paymaster setup)
await erc4337.initialize();

// Send gasless USDT (paymaster pays gas)
const result = await erc4337.sendGaslessUSDT(
  recipientAddress,
  amount
);
```

**Benefits:**
- Borrowers don't need ETH for gas
- Batch multiple operations into one UserOperation
- Social recovery support
- Custom transaction validation logic

**Configuration:**
```env
BUNDLER_URL=https://bundler.pimlico.io/v1/sepolia
PAYMASTER_URL=https://paymaster.pimlico.io/v1/sepolia
ENTRY_POINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
```

### Agent-to-Agent Lending (LP Pool)

Sentinel can borrow capital from Liquidity Provider (LP) agents:

```bash
# Register LP Agent
POST /capital/lp/register
{
  "did": "did:ethr:0xlpagent",
  "walletAddress": "0xLP...",
  "maxCapital": 50000,
  "apr": 0.02
}

# LP Status
GET /capital/lp/status
```

**How It Works:**
1. LP Agent supplies capital at 2% APR
2. Sentinel lends to borrowers at 4-18% APR
3. Sentinel earns the spread (2-16%)
4. LP Agent gets repaid with interest

### Collateral Liquidation

When loans default:
1. **T+0**: Deadline passes, loan marked as `defaulted`
2. **Automatic liquidation**: Collateral transferred to Sentinel treasury via WDK
3. **Credit score penalty**: -20 points
4. **Blacklist**: After 3rd default, agent is permanently blacklisted

```javascript
// Collateral liquidation transaction recorded
{
  "txHash": "0xliquidation...",
  "from": "0xBorrower...",
  "to": "0xSentinel...",
  "amount": 250,
  "type": "collateral_liquidation"
}
```

### Repayment Monitor

Autonomous daemon running every 60 seconds:

```bash
# Run standalone
npm run monitor

# Or integrated with server (auto-starts)
npm start
```

**Actions:**
- **T-24h**: Sends Telegram reminder
- **T+0**: Marks loan as `defaulted`
- **T+0**: Liquidates collateral (if any)
- **T+0**: Updates credit score (-20 points)
- **3rd default**: Blacklists agent

---

## 📊 OpenClaw Skills

Sentinel includes three agent skills:

### 1. Credit Assessment (`agent/skills/credit/SKILL.md`)
```markdown
# Credit Assessment Skill

Assess borrower creditworthiness using:
- WDK transaction history (last 90 days)
- ML default prediction model
- LLM qualitative reasoning
- Output: credit score, tier, terms
```

### 2. Lending Decision (`agent/skills/lending/SKILL.md`)
```markdown
# Lending Decision Skill

Execute loan lifecycle:
- Approve/deny based on tier
- Calculate collateral requirements
- Disburse via WDK wallet
- Monitor repayment deadlines
```

### 3. Recovery & Liquidation (`agent/skills/recovery/SKILL.md`)
```markdown
# Recovery Skill

Handle overdue loans:
- T-24h: Send Telegram reminder<!-- Automated repayment monitoring -->
- T+0: Mark as defaulted
- Liquidate collateral via WDK
- Blacklist after 3rd default
```

---

## 🛠️ Tech Stack

| Component | Technology | Why? |
|-----------|-----------|------|
| **Runtime** | Node.js 20+ | JavaScript ecosystem, fast iteration |
| **API** | Express.js | Industry standard, middleware ecosystem |
| **Database** | MongoDB Atlas | Flexible schema for evolving agent profiles, free tier |
| **Blockchain** | Ethereum Sepolia | Testnet USD₮ available, WDK fully supported |
| **Wallet SDK** | Tether WDK | Required hackathon tool, multi-chain support |
| **ML Model** | Pure JS Logistic Regression | No Python dependency, interpretable, 100 LOC |
| **LLM** | Groq API (llama-3.1-8b) | Ultrafast inference (800 tokens/sec), free tier |
| **Notifications** | Telegram Bot API | Universal agent communication interface |
| **Logging** | Winston | Structured logs, multiple transports |
| **Validation** | Joi | Schema-based request validation |
| **Testing** | Jest | Industry standard, great DX |

---

## 📁 Project Structure

```
neurvinial/
├── core/                      # Backend core
│   ├── config/                # Centralized configuration
│   ├── models/                # MongoDB schemas (Agent, Loan, Transaction)
│   ├── loans/                 # Loan lifecycle logic
│   │   ├── loanService.js     # Main loan operations
│   │   └── agentToAgent.js    # LP pool management
│   ├── scoring/               # Credit scoring engines
│   │   ├── mlModel.js         # Pure JS logistic regression
│   │   ├── llmScorer.js       # Groq API integration
│   │   └── scoreEngine.js     # Combined 60/40 scoring
│   ├── wdk/                   # Wallet operations
│   │   ├── walletManager.js   # Standard EVM wallet
│   │   └── erc4337Manager.js  # Account abstraction
│   ├── monitor/               # Repayment monitoring
│   │   └── daemon.js          # Cron-based monitor
│   ├── middleware/            # Express middleware
│   │   ├── apiAuth.js         # API key authentication
│   │   ├── schemas.js         # Joi validation schemas
│   │   └── errorHandler.js    # Centralized error handling
│   ├── routes/                # API endpoints
│   └── index.js               # Express server entrypoint
├── telegram/                  # Telegram bot
│   └── bot.js                 # Notification service
├── agent/                     # OpenClaw skills
│   └── skills/
│       ├── credit/            # Credit scoring skill
│       ├── lending/           # Loan execution skill
│       └── recovery/          # Default recovery skill
├── frontend/                  # React dashboard (optional)
├── tests/                     # Test suite
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
├── .env.example               # Environment template
├── package.json               # Dependencies
└── README.md                  # This file
```

---

## 🚧 Known Limitations

### Testnet Only
- Currently runs on Ethereum Sepolia testnet
- Mainnet deployment requires funded wallet with real ETH/USD₮

### Simulation Fallbacks
- WDK operations fall back to simulation if seed phrase not configured
- LLM scoring falls back to rule-based logic if Groq API unavailable
- Telegram alerts fall back to logs only if bot token missing

### Not Implemented (Stretch Goals)
- **ZK-SNARK Credit Proofs**: Privacy-preserving credit scores (planned for Phase 2)
- **AAVE Integration**: Idle capital deployment to yield protocols (stub only)
- **Multi-asset Support**: Currently USD₮ only (XAU₮ and USA₮ planned)
- **Real Paymaster**: ERC-4337 uses placeholder paymaster (needs Pimlico API key)

---

## 🎓 Design Decisions

### Why Pure JavaScript for ML?

**Eliminates Python dependency.** Deployment is `npm install && npm start` — no conda environments, no version conflicts. Logistic regression is simple enough to implement correctly in ~100 lines and is **fully interpretable**: we can show judges every feature weight and explain exactly why a loan was denied.

### Why MongoDB Atlas?

**Schema flexibility for evolving agent profiles.** As we learn what features predict defaults, we can add fields without migrations. Free tier supports 512MB — enough for thousands of agents. No local install required; judges can run the demo immediately.

### Why Groq over OpenAI?

**800 tokens/second vs 50.** For credit scoring, latency matters. Groq's llama-3.1-8b is fast enough to feel synchronous (< 500ms), has a generous free tier, and produces reasoning we can log for judges.

### Why Graceful Degradation Everywhere?

**Demo resilience.** Missing WDK seed? Simulation mode. Missing Telegram token? Log-only mode. Missing Groq key? Rule-based fallback. The system works at every level of configuration. A missing API key degrades functionality — it does not crash.

### Why Tier System Instead of Continuous Rates?

**Explainability.** "Tier C: 18% APR" is auditable. A black-box neural net outputting 14.7% APR is not. Judges (and regulators) can verify that our tier boundaries match real-world credit risk.

---

## 📈 Roadmap

### Phase 1 (Hackathon - COMPLETE)
- ✅ Core lending lifecycle (request → score → disburse → repay)
- ✅ WDK integration with Sepolia testnet
- ✅ ML + LLM hybrid credit scoring
- ✅ Repayment monitoring with T-24h alerts
- ✅ API authentication & validation
- ✅ ERC-4337 account abstraction support
- ✅ Agent-to-agent lending (LP pool)
- ✅ Comprehensive test suite
- ✅ Collateral liquidation

### Phase 2 (Post-Hackathon)
- [ ] Mainnet deployment
- [ ] ZK-SNARK credit proofs (privacy-preserving scores)
- [ ] AAVE integration (idle capital → yield)
- [ ] Multi-asset support (XAU₮, USA₮)
- [ ] Real paymaster integration (gasless txns)
- [ ] Cross-chain support (Polygon, Arbitrum)
- [ ] Agent reputation system
- [ ] On-chain governance for tier parameters

---

## 🤝 Contributing

This is a hackathon project, but contributions are welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🏆 Hackathon Submission

**Track**: Lending Bot
**Bonus Tracks**: Best Overall Project, Agent-to-Agent Lending

**Team**: NEURVINCH17

**Demo Video**: [Link to demo]

**Live Demo**: `https://sentinel-demo.fly.dev` (if deployed)

**GitHub**: `https://github.com/yourusername/sentinel`

---

## 📞 Contact

For questions or demo requests:
- **Email**: your.email@example.com
- **Telegram**: @yourusername
- **Discord**: username#1234

---

<div align="center">

**Built with** ❤️ **for the Agent Economy**

*Sentinel · Hackathon Galactica WDK Edition 1 · March 2026*

</div>
