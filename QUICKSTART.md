# 🚀 SENTINEL — Quick Start Guide

## One-Click Start (Windows)

### Step 1: Right-click `start-sentinel.ps1` and select "Run with PowerShell"

Or, from PowerShell:
```powershell
cd C:\Users\PANDAN\OneDrive\Desktop\neurvinial
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\start-sentinel.ps1
```

This will:
- ✅ Kill any existing process on port 3000
- ✅ Open Terminal 1 → Backend (port 3000)
- ✅ Open Terminal 2 → Frontend (port 5173)

---

## Manual Start (2 Terminals)

### Terminal 1: Backend API
```bash
cd C:\Users\PANDAN\OneDrive\Desktop\neurvinial
bun run dev
# or: npm run dev
```

You should see:
```
[sentinel] info: Sentinel listening on port 3000
```

### Terminal 2: Frontend
```bash
cd C:\Users\PANDAN\OneDrive\Desktop\neurvinial\frontend
npm run dev
# or: bun run dev
```

You should see:
```
➜  Local:   http://localhost:5173/
```

---

## Open in Browser

Once both are running:

🌐 **http://localhost:5173**

---

## What You'll See

### Landing Page (HOME)
- Animated 3D orbital rings
- Risk tier table (A/B/C/D)
- "LAUNCH DASHBOARD" button

### Dashboard
- **Register Agent** → Creates DID + initial credit score
- **Credit Lookup** → Query any agent's score & profile

### Loans
- **Request Loan** → Submit amount/purpose, get instant decision
- **Status Tracker** → Follow loan status, disburse, repay

### Capital
- **Live Metrics** → Deployed/Idle capital, interest earned
- **Yield Opportunities** → Available investment pools

---

## Stop the Servers

- **Backend**: Press `Ctrl+C` in Terminal 1
- **Frontend**: Press `Ctrl+C` in Terminal 2

---

## Testing Without MongoDB

All features work in **demo mode** (no database):
- ✅ Agent registration
- ✅ Credit scoring (ML + Groq LLM)
- ✅ Loan approval/denial
- ✅ Capital metrics

**Note**: Data persists in-memory during the session, clears on restart.

---

## Connect to MongoDB (Optional)

To persist data across sessions:

1. Go to https://cloud.mongodb.com
2. Resume your cluster if paused
3. Get connection string
4. Update `.env`:
   ```
   MONGODB_URI=mongodb+srv://...
   ```
5. Restart backend

---

## Troubleshooting

**Port 3000 already in use?**
```powershell
# Kill the process
Get-NetTCPConnection -LocalPort 3000 | Stop-Process -Force
```

**Port 5173 already in use?**
```bash
# Kill the process (use a different port)
cd frontend
npm run dev -- --port 5174
```

**Backend won't start?**
- Check `.env` file exists
- Ensure `npm install` completed
- Try: `npm run dev` (uses nodemon with file watching)

**Frontend won't load?**
- Clear browser cache (Ctrl+Shift+Delete)
- Check browser console (F12) for errors
- Ensure backend is running on port 3000

---

## Next Steps

1. ✅ **Run the project** (this guide)
2. 📚 **Read FRONTEND_README.md** for detailed API docs
3. 🧪 **Test all features** in the UI
4. 🔗 **Connect MongoDB** for persistence
5. 🚀 **Deploy** to production

---

## Commands Reference

```bash
# Backend
npm start              # Production mode
npm run dev            # Development (nodemon)
npm test               # Run 30 tests

# Frontend
npm run dev            # Vite dev server
npm run build          # Production build (dist/)
npm run preview        # Preview production build

# Both
bun run dev            # Use Bun instead of npm (faster)
```

---

**Built for Tether Hackathon Galactica · WDK Edition 1 · March 2026**
