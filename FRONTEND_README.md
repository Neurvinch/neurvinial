# 🚀 SENTINEL — Full Stack Setup & Running Guide

## Project Structure

```
sentinel/
├── core/              ← Backend (Node.js + Express)
├── frontend/          ← Frontend (React + Vite)
└── ...
```

**Backend**: `http://localhost:3000`
**Frontend**: `http://localhost:5173`

---

## 🎯 Quick Start (Two Terminals)

### Terminal 1: Backend Server
```bash
cd /c/Users/PANDAN/OneDrive/Desktop/neurvinial

# Start the backend (Express API)
npm start
```

You should see:
```
[sentinel] info: Sentinel listening on port 3000
```

### Terminal 2: Frontend Dev Server
```bash
cd /c/Users/PANDAN/OneDrive/Desktop/neurvinial/frontend

# Start the React + Vite dev server
npm run dev
```

You should see:
```
➜  Local:   http://localhost:5173/
```

**Open browser to**: `http://localhost:5173`

---

## 📊 What Works End-to-End

✅ **Landing Page** - Hero section with animated 3D orbs
✅ **Agent Registration** - Create DID + get credit score
✅ **Credit Lookup** - Query any agent's score & profile
✅ **Loan Requests** - Submit with amount/purpose, get decision
✅ **Loan Status** - Track & disburse loans
✅ **Capital Dashboard** - Live treasury metrics
✅ **Full API Integration** - All endpoints connected

---

## ⚙️ Configuration

### Backend (.env)
```bash
# Required (for demo mode):
GROQ_API_KEY=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
TELEGRAM_BOT_TOKEN=7672027976:AAHxD_eX0TX9q9jNHrrm4UGtE9Ob95MhNwo

# Optional (not needed for demo):
MONGODB_URI=mongodb+srv://...
WDK_SEED_PHRASE=...
```

Currently running in **demo mode** (no MongoDB).
API endpoints return mock data or gracefully degrade.

---

## 🧪 Testing

### Run Full Test Suite (Backend)
```bash
npm test
# 30 tests, all passing ✓
```

### Manual API Testing with curl

```bash
# Health check
curl http://localhost:3000/health

# Register agent
curl -X POST http://localhost:3000/agents/register \
  -H "Content-Type: application/json" \
  -d '{"metadata":{"name":"Agent-1"}}'

# Get credit score
curl http://localhost:3000/agents/did:sentinel:0x.../score

# Request loan
curl -X POST http://localhost:3000/loans/request \
  -H "Content-Type: application/json" \
  -d '{"did":"did:sentinel:0x...","amount":1000,"purpose":"working capital"}'
```

---

## 🌐 Frontend Features

### Pages

| Page | Features |
|------|----------|
| **Home** | Hero section + risk tier table |
| **Dashboard** | Agent registration + credit score display |
| **Loans** | Request form + status tracker |
| **Capital** | Treasury metrics + yield opportunities |

### Design

- **Dark cosmic theme** with neon cyan/violet/gold
- **Glassmorphism** cards with blur backdrop
- **Animated starfield** canvas background
- **Custom cursor** with glow trail
- **Smooth scroll** navigation
- **Framer Motion** page transitions

---

## 📦 Deployment

### Build Frontend for Production

```bash
cd frontend
npm run build
# Output: dist/ directory (ready for Vercel/Netlify)
```

### Deploy Backend

```bash
# Push to Heroku/Railway/Render
git add . && git commit -m "prod ready"
git push heroku main
```

---

## 🛠️ Development Workflow

### Hot Reload (Auto Restart)

**Backend** (with nodemon):
```bash
npm run dev
# Restarts on file changes
```

**Frontend** (with Vite):
```bash
cd frontend && npm run dev
# HMR — instant module replacement
```

---

## 🔌 API Endpoints

All endpoints integrate with the frontend in real-time:

| Method | Endpoint | Frontend Page |
|--------|----------|---------------|
| `POST` | `/agents/register` | Dashboard |
| `GET` | `/agents/:did/score` | Dashboard |
| `POST` | `/loans/request` | Loans |
| `GET` | `/loans/:id/status` | Loans |
| `POST` | `/loans/:id/disburse` | Loans |
| `GET` | `/capital/status` | Capital |

---

## 🧠 Architecture

**Backend** processes:
- DID generation & verification
- ML credit scoring (logistic regression)
- LLM reasoning via Groq
- Loan lifecycle (request → approve → disburse → repay)
- Risk tier assignment (A/B/C/D)

**Frontend** displays:
- Interactive forms with real-time validation
- Animated credit score rings (color-coded by tier)
- Loan status cards with action buttons
- Capital allocation charts

---

## 💡 Next Steps

1. **Connect MongoDB** (optional — system works in demo mode)
   - Pause & resume your Atlas cluster if needed
   - Update `.env` with correct connection string

2. **Deploy to Production**
   - Frontend → Vercel / Netlify
   - Backend → Heroku / Railway / Render

3. **Add More Features**
   - ZK proofs for credit scores
   - Multi-chain support (beyond Sepolia)
   - Advanced yield strategies
   - Dashboard analytics

---

**Built for Tether Hackathon Galactica · WDK Edition 1 · March 2026**

