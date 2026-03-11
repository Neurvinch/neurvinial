
**🏦 SENTINEL**   ·   Autonomous AI Lending Agent   ·   Hackathon Galactica WDK Edition 1



**🏦 SENTINEL**

**Autonomous AI Lending Agent**

**for the Agent Economy**

─────────────────────────────────────────

Hackathon Galactica: WDK Edition 1  ·  Lending Bot Track

February 25 – March 22, 2026


|**💰 Lending Bot Track**|**🤖 OpenClaw Agent**|**⛓️ WDK Native**|
| :-: | :-: | :-: |


Built for: Tether Hackathon Galactica  ·  Track: Lending Bot

Stack: Node.js · OpenClaw · WDK · MongoDB · Telegram

\



# **1. Executive Summary**
Sentinel is a fully autonomous on-chain lending agent built for the emerging agent economy. As AI agents become independent economic actors, they lack one critical primitive: 

**a credit identity and a trustless lending layer.**

Sentinel solves this end-to-end:

- Agents register a Decentralized Identity (DID) with Sentinel
- Sentinel scores their credit using on-chain history + ML default prediction
- OpenClaw's reasoning engine autonomously approves/denies loans with risk-adjusted terms
- WDK executes USD₮ transfers on-chain — no human in the loop
- Repayment monitoring, Telegram alerts, and auto-liquidation run 24/7
- Idle capital is redeployed to yield opportunities between loans

This is not a proof-of-concept. This is deployable infrastructure for the world where agents hold wallets, earn revenue, and need capital.

|**Judging Criterion**|**How Sentinel Wins**|
| :-: | :-: |
|**Technical Correctness**|WDK wallet ops, OpenClaw reasoning, on-chain settlement — all integrated end-to-end with clean architecture|
|**Agent Autonomy**|Zero human prompts. Agent decides loan terms, issues funds, tracks repayment, liquidates defaults — fully autonomous loop|
|**Economic Soundness**|Risk-tiered interest rates, ML default prediction, capital reallocation to DeFi yields — real finance logic|
|**Real-World Applicability**|Agent credit is a $B unsolved problem. Every agent framework that uses WDK wallets needs Sentinel|


# **2. The Problem We're Solving**
## **2.1  AI Agents Are Becoming Economic Actors**
The hackathon brief says it plainly: **"agents are economic infrastructure."** With WDK, agents can now hold wallets and transact on-chain. But capital access remains gated by a missing primitive:

**No agent has a credit score. No agent can borrow. No system exists to lend to them.**

## **2.2  Why This Matters Right Now**

|**Scenario**|**Without Sentinel**|**With Sentinel**|
| :-: | :-: | :-: |
|Agent needs capital to complete a task|Task fails. No capital source.|Agent borrows USD₮, completes task, repays from revenue.|
|Liquidity pool has idle capital|Capital sits unused.|Sentinel deploys it to borrower agents earning yield.|
|Agent economy scales to millions of bots|No trust layer exists between agents.|Sentinel's DID registry becomes the credit bureau of the agent economy.|


# **3. Solution Architecture**
## **3.1  System Overview**
Sentinel is composed of four loosely coupled layers. Each layer has a single responsibility, clean interfaces, and can be upgraded independently.

|**Layer**|**Component**|**Responsibility**|
| :-: | :-: | :-: |
|**1. Identity**|DID Registry|Agents register on-chain identity. History is append-only and auditable.|
|**2. Intelligence**|OpenClaw Reasoner + ML Scorer|LLM reasons over credit profile. ML model predicts default probability.|
|**3. Execution**|WDK Wallet + Signer|WDK executes USD₮ transfers, signs transactions, monitors on-chain state.|
|**4. Operations**|Repayment Monitor + Reallocator|Tracks deadlines, sends alerts, liquidates defaults, redeploys idle capital.|

## **3.2  Loan Lifecycle (Step by Step)**
1. Borrower agent submits a loan request with DID, amount, and stated purpose
1. OpenClaw fetches agent's on-chain history from WDK transaction monitor
1. ML scorer runs logistic regression over repayment history, velocity, and collateral
1. LLM reasoning layer applies risk-tiered interest rate and loan cap
1. Decision logged: approve → WDK signs USD₮ transfer on-chain
1. Repayment deadline set; monitor begins polling every block
1. T-24h: Telegram alert sent to borrower agent
1. On repayment: credit score increases, capital redeployed
1. On default: collateral liquidated via WDK, DID flagged in registry

## **3.3  Credit Scoring Engine**
The credit scorer combines two signals for maximum accuracy and interpretability:

|**Signal Source**|**Features Used**|**Weight**|
| :-: | :-: | :-: |
|**ML Model**|Repayment history, on-time rate, loan frequency, collateral ratio, velocity|60% — objective, historical, bias-resistant|
|**LLM Reasoner**|Stated purpose, agent type, network trust graph, contextual risk signals|40% — qualitative, contextual, adaptable|



## **3.4  Risk Tiers & Interest Rates**

|**Tier**|**Score Range**|**APR**|**Max Loan (USD₮)**|**Collateral**|
| :-: | :-: | :-: | :-: | :-: |
|**A — Prime**|80 – 100|4%|10,000|None required|
|**B — Standard**|60 – 79|9%|3,000|25% collateral|
|**C — Subprime**|40 – 59|18%|500|50% collateral|
|**D — Denied**|0 – 39|N/A|0|Loan denied|



# **4. Technical Stack**
## **4.1  Stack Decisions (Senior Dev Rationale)**
Every technology choice below is deliberate. We are not stacking buzzwords — every tool earns its place.

|**Technology**|**Role**|**Why This, Not Something Else**|
| :-: | :-: | :-: |
|**OpenClaw**|Agent reasoning & orchestration|Required by track. Open-source. File-based skills make it easy to inject credit logic as a skill module.|
|**Tether WDK**|Wallet creation, signing, USD₮ transfers|Self-custodial. Multi-chain. Direct USD₮ support. The only correct choice for this hackathon.|
|**Node.js / Express**|API layer & orchestration backend|WDK SDK is Node-first. Low latency. Easy async with Promise chains for on-chain polling.|
|**MongoDB**|Agent credit history, loan records|Schema-flexible for evolving agent profiles. Native JSON. Fast aggregation for ML feature extraction.|
|**Python (scikit-learn)**|ML default prediction model|Logistic regression is interpretable and explainable to judges. Trains on synthetic + real repayment data.|
|**Telegram Bot API**|Agent notifications & alerts|Already battle-tested in similar projects. Instant delivery. Free. No infra overhead.|
|**DID (W3C Standard)**|Agent identity layer|Interoperable. On-chain. Standard that survives beyond this hackathon. Bonus point from judging criteria.|

## **4.2  Repository Structure**
sentinel/

├── agent/                    # OpenClaw skill definitions

│   ├── skills/credit.md      # Credit scoring skill

│   ├── skills/lending.md     # Loan decision skill

│   └── skills/recovery.md    # Default recovery skill

├── core/                     # Node.js backend

│   ├── wdk/                  # WDK wallet integration

│   ├── scoring/              # ML + LLM credit scoring

│   ├── loans/                # Loan lifecycle manager

│   ├── monitor/              # Repayment monitor daemon

│   └── reallocator/          # Capital reallocation module

├── ml/                       # Python ML model

│   ├── model.py              # Logistic regression scorer

│   ├── train.py              # Training pipeline

│   └── features.py           # Feature extraction from MongoDB

├── did/                      # DID registry integration

├── telegram/                 # Notification bot

├── tests/                    # Integration & unit tests

└── README.md


# **5. Build Plan & Timeline**
Submissions close March 22. We have 12 days from today. This is a realistic senior-dev schedule — no padding, no wishful thinking.

## **Week 1: March 10–15  —  Core Infrastructure**

|**Day**|**Task**|**Owner**|**Status**|
| :-: | :-: | :-: | :-: |
|**Mar 10**|WDK setup: Node.js quickstart, wallet creation, USD₮ transfer on Sepolia testnet|Lead Dev|**TODAY**|
|**Mar 11**|MongoDB schema: Agent DID model, Loan model, Transaction history model|Lead Dev|Pending|
|**Mar 12**|DID registration endpoint: agents POST their DID, Sentinel stores + validates|Lead Dev|Pending|
|**Mar 13**|OpenClaw skill: credit.md — fetches agent history, calls scorer, returns decision|Lead Dev|Pending|
|**Mar 14**|WDK loan issuance: approve → sign → broadcast USD₮ transfer → log txn hash|Lead Dev|Pending|
|**Mar 15**|End-to-end test: Agent A requests loan → Sentinel approves → USD₮ moves on testnet|Lead Dev|Pending|

## **Week 2: March 16–20  —  Intelligence + Monitoring**

|**Day**|**Task**|**Owner**|**Status**|
| :-: | :-: | :-: | :-: |
|**Mar 16**|Python ML model: logistic regression on synthetic repayment dataset, API endpoint|Lead Dev|Pending|
|**Mar 17**|Repayment monitor daemon: block polling, deadline tracking, state transitions|Lead Dev|Pending|
|**Mar 18**|Telegram bot: loan approved/denied, T-24h reminder, default alert messages|Lead Dev|Pending|
|**Mar 19**|Capital reallocation: detect idle USD₮ → route to yield stub (DeFi protocol integration)|Lead Dev|Pending|
|**Mar 20**|Agent-to-agent lending: Liquidity Pool Agent borrows to Sentinel, Sentinel re-lends|Lead Dev|Pending|

## **Final Sprint: March 21–22  —  Polish & Submit**
- Record demo video: 2-minute live demo showing full loan lifecycle on testnet
- Write README: architecture, setup instructions, design decisions, known limits
- DoraHacks submission: fill all fields, attach demo video and repo link
- Attend Final AMA (Mar 20, 3 PM UTC) and submission walkthrough


# **6. Bonus Features (Judge Score Multipliers)**
The Lending Bot track lists three bonus features. We implement all three. This is where we pull away from other submissions.

## **6.1  Agent-to-Agent Lending**
Sentinel itself can borrow capital from a Liquidity Pool Agent (another WDK wallet) to fund loan demand that exceeds its own reserves. This creates a recursive agent economy where:

- Sentinel borrows at low APR from the LP Agent
- Sentinel lends at higher APR to borrower agents
- Sentinel earns the spread autonomously
- LP Agent earns yield on idle capital it would otherwise hold

Implementation: Two OpenClaw agents share a message bus (Telegram group). LP Agent monitors Sentinel's reserve level. When reserves fall below threshold, LP Agent automatically sends a capital offer.

## **6.2  ML Default Prediction**
A Python logistic regression model trained on the following features:

- on\_time\_repayment\_rate: fraction of loans repaid before deadline
- loan\_frequency: number of loans in last 90 days
- avg\_loan\_duration: average days to repay
- collateral\_ratio: collateral value / loan value
- tx\_velocity: number of on-chain transactions in last 30 days
- wallet\_age\_days: age of WDK wallet (proxy for agent maturity)

Output: probability of default (0.0 – 1.0). Threshold at 0.35 for loan denial. Model is retrained weekly on real repayment data as it accumulates.

## **6.3  Zero-Knowledge Credit Verification (Stretch Goal)**
Using ZK-SNARKs, Sentinel can prove to a counterparty that an agent's credit score exceeds a threshold without revealing the underlying transaction history. This is a stretch goal for submission day — if time allows, we will implement a simple Circom circuit for score range proofs.


# **7. API Reference**
## **7.1  Agent Endpoints**

|**Method**|**Endpoint**|**Description**|
| :-: | :-: | :-: |
|POST|/agents/register|Register a new agent DID. Returns wallet address.|
|GET|/agents/:did/score|Fetch credit score + tier for a given DID.|
|POST|/loans/request|Submit a loan request. Body: { did, amount, purpose }.|
|GET|/loans/:id/status|Poll loan status: pending | approved | disbursed | repaid | defaulted.|
|POST|/loans/:id/repay|Trigger repayment. Sentinel verifies on-chain and updates credit score.|
|GET|/capital/status|Returns current reserve balance, deployed capital, and yield earned.|

## **7.2  OpenClaw Skill Interface**
Sentinel registers three skills with OpenClaw. Each skill file is a Markdown document with structured input/output contracts:

- credit.md — inputs: agent DID. outputs: score (0-100), tier (A/B/C/D), max\_loan, rate
- lending.md — inputs: loan request object. outputs: decision, terms, txn\_hash if approved
- recovery.md — inputs: loan ID. outputs: action taken (reminder | liquidate | blacklist)


# **8. Risks & Mitigations**
A senior dev acknowledges risks upfront. Here are ours and how we handle them:

|**Risk**|**Likelihood**|**Mitigation**|
| :-: | :-: | :-: |
|WDK testnet instability / faucet dry|**Medium**|Use both Pimlico + Candide faucets. Mock WDK layer for demo if needed.|
|ML model overfits on synthetic data|**Medium**|Use regularization (L2). Show cross-validation score in demo. Judges care about approach, not perfection.|
|OpenClaw integration complexity|**Low**|Use MCP toolkit as fallback. 35 pre-built tools cover wallet ops. Skills are just markdown.|
|Scope creep on bonus features|**High**|Strict order: core flow first, bonuses only after Mar 20 milestone is green.|


# **9. Why Sentinel Wins**
**Three reasons Sentinel takes Best Overall + Lending Bot track:**

## **9.1  Highest Ceiling on Autonomy**
The lending track is the only track where the bonus criteria include agent-to-agent interaction, ML models, and ZK proofs. No other track lets you stack this many judge-impressive features into a single coherent system. The tipping bot has a low ceiling. The DeFi agent competes on DeFi depth. Lending Bot is where a well-rounded team wins big.
## **9.2  The Idea Is Inevitable**
Judges from Tether understand that agent wallets are just the start. The next primitive is agent credit. Sentinel doesn't just solve a hackathon prompt — it solves the actual next problem in agentic finance. Judges who think about the long arc will recognize this immediately.
## **9.3  Clean Architecture Signals Senior Execution**
Four layers. Single responsibility each. Clean API contracts. A README that explains design decisions and known limitations. This is not a hackathon hack — it is a deployable system. That is exactly what the judging criterion 'Real-world applicability' rewards.


**Let's build this. Deadline: March 22, 11:59 PM UTC.**

— Sentinel Team
Confidential · Hackathon Submission · March 2026	


