Claude
Let me start by reading the project documentation to understand what we're building.

Read Sentinel_Project_Doc.md

This is an ambitious, well-documented project. Let me plan this carefully before writing a single line of code.

Used tool: EnterPlanMode

Let me first explore the current state of the repository to understand what already exists.

The project is a clean slate - only the doc file exists. Now let me design a detailed implementation plan.

I now have the complete plan from the research agent. Let me write the final plan file.Before I finalize, let me clarify a few things about your setup.

Used tool: AskUserQuestion

Analyzing your answers...

Do you have MongoDB installed locally, or should we use MongoDB Atlas (cloud) or a Docker container?
MongoDB Atlas
- Use a free cloud MongoDB cluster (no local install needed)
Do you have Python installed on this machine? (Needed for the ML scoring model)
No Python
- Python is not installed - we can use a Node.js-only approach for ML scoring instead
Do you have a Telegram bot token ready, or should we skip Telegram for now and add it later?
Have bot token
- I already created a Telegram bot via @BotFather and have a token
Should we build the project inside a sentinel/ subdirectory or directly in the repo root?
Repo root
- Build directly in the repo root alongside the project doc
Good - clear answers. Let me update the plan accordingly:

MongoDB Atlas - We'll use a cloud connection string instead of local
No Python - We'll implement the ML scoring model entirely in Node.js (using ml-logistic-regression or writing our own logistic regression - keeps the stack simpler)
Telegram bot - Ready to integrate
Repo root - Build directly alongside the doc
Here is Claude's plan:

Sentinel - Implementation Plan
Context
Building "Sentinel" - an Autonomous AI Lending Agent for the Tether Hackathon Galactica (WDK Edition 1, Lending Bot Track). The project is starting from scratch (only Sentinel_Project_Doc.md exists). We need to build the entire system AND create a comprehensive teaching markdown explaining every line of code.

Stack: Node.js/Express, MongoDB Atlas (cloud), Tether WDK, Telegram Bot, OpenClaw No Python - ML scoring implemented in pure Node.js (logistic regression) Build location: Repo root (alongside Sentinel_Project_Doc.md)

Build Order (12 Phases)
Phase 0: Project Initialization
Create directory structure (sentinel/ with all subdirs)
package.json with all Node.js dependencies
.env.example for environment template
.gitignore
ml/requirements.txt for Python deps
npm install
Phase 1: Foundation Layer
core/config/index.js - Centralized config (validates env vars at startup)
core/config/logger.js - Winston structured logging
core/models/Agent.js - Agent DID + credit profile schema
core/models/Loan.js - Loan lifecycle schema (status enum, scoring fields, alerts)
core/models/Transaction.js - On-chain transaction record
core/models/index.js - Barrel export
core/middleware/errorHandler.js - Express error handler
core/middleware/validateRequest.js - Joi validation factory
core/utils/constants.js - Risk tier definitions (A/B/C/D)
core/utils/tierCalculator.js - Score-to-tier pure function
core/index.js - Express entry point (health check, middleware, routes)
Phase 2: WDK Wallet Integration
core/wdk/walletManager.js - WDK singleton: init, create wallet, send USDT, check balance
core/wdk/balanceChecker.js - Balance query helper
Phase 3: DID Registry
did/didService.js - DID generation (did:sentinel:...), resolution, verification
core/routes/agentRoutes.js - POST /agents/register, GET /agents/:did/score
Phase 4: Credit Scoring Engine (Pure Node.js - No Python)
core/scoring/mlModel.js - Logistic regression in pure JS (synthetic training + inference)
core/scoring/llmScorer.js - LLM-based qualitative scoring
core/scoring/scoreEngine.js - Combined score (60% ML + 40% LLM)
Phase 5: Loan Lifecycle Manager
core/loans/loanService.js - Request -> Score -> Approve/Deny -> Disburse -> Repay/Default
core/routes/loanRoutes.js - POST /loans/request, GET /loans/:id/status, POST /loans/:id/repay
Phase 6: Repayment Monitor
core/monitor/daemon.js - Cron-based polling, deadline tracking, auto-default/liquidation
Phase 7: Telegram Notifications
telegram/bot.js - Loan approved/denied alerts, T-24h reminders, default alerts
Phase 8: Capital Reallocation
core/reallocator/capitalService.js - Idle capital detection, yield deployment stub
core/routes/capitalRoutes.js - GET /capital/status
Phase 9: OpenClaw Skills
agent/skills/credit/SKILL.md - Credit scoring skill
agent/skills/lending/SKILL.md - Loan decision skill
agent/skills/recovery/SKILL.md - Default recovery skill
agent/openclaw.json - Workspace config
Phase 10: Agent-to-Agent Lending (Bonus)
core/loans/agentToAgent.js - LP Agent capital requests, spread earning
Phase 11: Tests
tests/unit/tierCalculator.test.js
tests/unit/scoreEngine.test.js
tests/integration/loanLifecycle.test.js
Phase 12: Documentation
TEACHING.md - Line-by-line code walkthrough (built incrementally per phase)
README.md - Architecture, setup, design decisions
Key Dependencies
Node.js (14 production + 4 dev): @tetherto/wdk, @tetherto/wdk-wallet-evm, express, mongoose, dotenv, node-telegram-bot-api, axios, uuid, winston, node-cron, helmet, cors, joi, express-rate-limit | dev: nodemon, jest, eslint, supertest

No Python needed - ML model runs in Node.js

Total Files: 43
All files listed in detailed manifest in the research output.