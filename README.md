# Sentinel

**Autonomous AI Lending Agent for the Agent Economy**

Built for Tether Hackathon Galactica · WDK Edition 1 · Lending Bot Track

---

## What It Does

Sentinel gives AI agents a credit identity and a trustless way to borrow USD₮. No human in the loop.

1. Agent registers a DID (Decentralized Identity) with Sentinel
2. Sentinel scores their credit: ML model (60%) + LLM reasoning (40%)
3. Autonomous approve/deny with risk-adjusted terms
4. WDK executes USD₮ transfer on-chain
5. Repayment monitor tracks deadlines, sends Telegram alerts, auto-defaults
6. Credit score updates on every repayment or default

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd sentinel
npm install

# Configure environment
cp .env.example .env
# Edit .env — set MONGODB_URI and PORT at minimum

# Run tests (no .env needed)
npm test

# Start the server
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |
| `POST` | `/agents/register` | Register a new agent DID |
| `GET` | `/agents/:did/score` | Get credit score + tier |
| `GET` | `/agents/:did` | Get full DID Document |
| `POST` | `/loans/request` | Submit loan request `{ did, amount, purpose }` |
| `GET` | `/loans/:id/status` | Poll loan status |
| `POST` | `/loans/:id/disburse` | Disburse an approved loan on-chain |
| `POST` | `/loans/:id/repay` | Process repayment |
| `GET` | `/capital/status` | Reserve balance + deployed capital |

## Risk Tiers

| Tier | Score | APR | Max Loan | Collateral |
|------|-------|-----|----------|------------|
| A — Prime | 80–100 | 4% | 10,000 USDT | None |
| B — Standard | 60–79 | 9% | 3,000 USDT | 25% |
| C — Subprime | 40–59 | 18% | 500 USDT | 50% |
| D — Denied | 0–39 | — | 0 | — |

## Stack

- **Node.js / Express** — API layer
- **MongoDB Atlas** — Agent profiles, loan records, transactions
- **Tether WDK** — Wallet creation, USD₮ transfers (Sepolia testnet)
- **Logistic Regression (pure JS)** — ML default prediction (6 features)
- **Groq API** — Ultrafast LLM-based qualitative credit reasoning (optional)
- **Telegram Bot** — Loan alerts and reminders
- **OpenClaw** — Agent skill definitions

## Tests

```bash
npm test              # 30 tests, all passing
npm run test:unit     # Unit tests (no DB needed)
npm run test:integration  # Integration tests
```

## Known Limitations

- WDK yield reallocation is a stub — Aave integration pending
- Agent-to-agent LP capital is in-memory only (not persisted)
- ZK-SNARK credit proof is a stretch goal (not implemented)
- Sepolia testnet only — mainnet requires funded wallet

## Design Decisions

**Why pure JS for ML?** No Python dependency simplifies deployment. Logistic regression is simple enough to implement correctly in 100 lines of JavaScript and is fully interpretable — we can show every weight to judges.

**Why MongoDB Atlas?** Schema-flexible for evolving agent profiles. Free tier. No local install required for judges to run the demo.

**Why graceful degradation everywhere?** WDK simulation mode, Telegram log-only mode, rule-based LLM fallback — the system works at every level of configuration. A missing API key degrades functionality, it does not crash the server.

---

*Sentinel Team · Hackathon Galactica WDK Edition 1 · March 2026*
