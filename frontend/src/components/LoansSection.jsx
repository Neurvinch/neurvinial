import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Banknote, Search, CheckCircle, XCircle, Clock, Zap, AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { api } from '../api';

const purposes = [
  'Working capital',
  'Protocol liquidity',
  'Yield strategy',
  'NFT acquisition',
  'Cross-chain bridge',
  'Other',
];

function StatusBadge({ status }) {
  const map = {
    approved:  { cls: 'status-approved',  icon: CheckCircle, label: 'APPROVED' },
    denied:    { cls: 'status-denied',    icon: XCircle,     label: 'DENIED' },
    pending:   { cls: 'status-pending',   icon: Clock,       label: 'PENDING' },
    disbursed: { cls: 'status-disbursed', icon: Zap,         label: 'DISBURSED' },
    repaid:    { cls: 'status-repaid',    icon: CheckCircle, label: 'REPAID' },
    defaulted: { cls: 'status-defaulted', icon: AlertTriangle,label:'DEFAULTED' },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-display font-bold tracking-widest ${m.cls}`}>
      <Icon size={10} /> {m.label}
    </span>
  );
}

function InfoRow({ label, value, mono = true }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5">
      <span className="font-mono text-[10px] text-white/30 tracking-widest shrink-0">{label}</span>
      <span className={`${mono ? 'font-mono' : 'font-body'} text-xs text-white/70 text-right break-all`}>{value}</span>
    </div>
  );
}

export default function LoansSection() {
  // Request state
  const [did,        setDid]        = useState('');
  const [amount,     setAmount]     = useState('');
  const [purpose,    setPurpose]    = useState(purposes[0]);
  const [requesting, setRequesting] = useState(false);
  const [loanResult, setLoanResult] = useState(null);
  const [reqError,   setReqError]   = useState('');

  // Status state
  const [loanId,      setLoanId]      = useState('');
  const [statusResult,setStatusResult]= useState(null);
  const [statusLoading,setStatusLoading]= useState(false);
  const [statusError, setStatusError] = useState('');
  const [actionLoading,setActionLoading]= useState('');

  const requestLoan = async () => {
    if (!did.trim() || !amount || !purpose) return;
    setRequesting(true); setReqError(''); setLoanResult(null);
    try {
      const res = await api.requestLoan({ did: did.trim(), amount: parseFloat(amount), purpose });
      setLoanResult(res);
    } catch (e) {
      setReqError(e.message);
    } finally {
      setRequesting(false);
    }
  };

  const fetchStatus = async () => {
    if (!loanId.trim()) return;
    setStatusLoading(true); setStatusError('');
    try {
      const res = await api.getLoanStatus(loanId.trim());
      setStatusResult(res);
    } catch (e) {
      setStatusError(e.message);
    } finally {
      setStatusLoading(false);
    }
  };

  const doAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'disburse') await api.disburseLoan(statusResult._id);
      if (action === 'repay')    await api.repayLoan(statusResult._id);
      await fetchStatus();
    } catch (e) {
      setStatusError(e.message);
    } finally {
      setActionLoading('');
    }
  };

  return (
    <section id="loans" className="relative min-h-screen px-6 pt-28 pb-20">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity:0,y:20 }} whileInView={{ opacity:1,y:0 }} viewport={{ once:true }}
          transition={{ duration:0.6 }} className="mb-10"
        >
          <div className="font-mono text-[10px] text-violet-400/50 tracking-[0.3em] mb-2">// LENDING ENGINE</div>
          <h2 className="font-display text-3xl font-bold gradient-text-cv">Loan Operations</h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">

          {/* ── Request Loan ───────────────────────── */}
          <motion.div initial={{ opacity:0,x:-30 }} whileInView={{ opacity:1,x:0 }} viewport={{ once:true }}
            transition={{ duration:0.7 }} className="glass glass-hover rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Banknote size={16} className="text-cyan-400" />
              <span className="font-display text-sm tracking-widest text-white/70">REQUEST LOAN</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-white/30 tracking-widest block mb-1.5">AGENT DID</label>
                <input className="field" placeholder="did:sentinel:0x..." value={did} onChange={e=>setDid(e.target.value)} />
              </div>
              <div>
                <label className="font-mono text-[10px] text-white/30 tracking-widest block mb-1.5">AMOUNT (USDT)</label>
                <input className="field" type="number" min="1" placeholder="500" value={amount} onChange={e=>setAmount(e.target.value)} />
              </div>
              <div>
                <label className="font-mono text-[10px] text-white/30 tracking-widest block mb-1.5">PURPOSE</label>
                <select className="field" value={purpose} onChange={e=>setPurpose(e.target.value)}>
                  {purposes.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <button className="btn-primary w-full flex items-center justify-center gap-2"
                onClick={requestLoan} disabled={requesting || !did.trim() || !amount}
              >
                {requesting ? (
                  <><RefreshCw size={11} className="animate-spin" />SCORING...</>
                ) : (
                  <><Send size={11} />SUBMIT REQUEST</>
                )}
              </button>

              {reqError && (
                <div className="flex items-start gap-2 p-3 rounded bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="font-mono text-[11px] text-red-400">{reqError}</span>
                </div>
              )}
            </div>

            <AnimatePresence>
              {loanResult && (
                <motion.div
                  initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  transition={{ duration:0.5 }}
                  className="mt-6 border border-cyan-400/15 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[10px] text-cyan-400/50 tracking-widest">// DECISION</span>
                    <StatusBadge status={loanResult.status} />
                  </div>

                  {loanResult.status === 'approved' && loanResult.term && (
                    <>
                      <InfoRow label="LOAN ID"    value={loanResult.id ?? loanResult._id} />
                      <InfoRow label="AMOUNT"     value={`${loanResult.term.amount} USDT`} />
                      <InfoRow label="APR"        value={`${loanResult.term.apr}%`} />
                      <InfoRow label="DURATION"   value={`${loanResult.term.durationDays} days`} />
                      <InfoRow label="COLLATERAL" value={`${loanResult.term.collateral ?? 0} USDT`} />
                    </>
                  )}
                  {loanResult.status === 'denied' && loanResult.reason && (
                    <div className="font-mono text-[11px] text-red-400/70 mt-2">{loanResult.reason}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Status Tracker ─────────────────────── */}
          <motion.div initial={{ opacity:0,x:30 }} whileInView={{ opacity:1,x:0 }} viewport={{ once:true }}
            transition={{ duration:0.7 }} className="glass glass-hover rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Search size={16} className="text-violet-400" />
              <span className="font-display text-sm tracking-widest text-white/70">STATUS TRACKER</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-white/30 tracking-widest block mb-1.5">LOAN ID</label>
                <input className="field" placeholder="Loan ObjectId..." value={loanId} onChange={e=>setLoanId(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&fetchStatus()} />
              </div>
              <button className="btn-secondary w-full" onClick={fetchStatus} disabled={statusLoading || !loanId.trim()}>
                {statusLoading ? 'FETCHING...' : 'TRACK LOAN'}
              </button>
              {statusError && (
                <div className="flex items-start gap-2 p-3 rounded bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="font-mono text-[11px] text-red-400">{statusError}</span>
                </div>
              )}
            </div>

            <AnimatePresence>
              {statusResult && (
                <motion.div
                  initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  transition={{ duration:0.5 }}
                  className="mt-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[10px] text-violet-400/50 tracking-widest">// LOAN STATUS</span>
                    <StatusBadge status={statusResult.status} />
                  </div>

                  <div className="space-y-0 mb-5">
                    <InfoRow label="AGENT DID" value={statusResult.agentDid ?? '—'} />
                    <InfoRow label="AMOUNT"    value={statusResult.amount ? `${statusResult.amount} USDT` : '—'} />
                    <InfoRow label="APR"       value={statusResult.apr ? `${statusResult.apr}%` : '—'} />
                    <InfoRow label="DUE DATE"  value={statusResult.dueDate ? new Date(statusResult.dueDate).toLocaleDateString() : '—'} />
                    {statusResult.txHash && <InfoRow label="TX HASH" value={`${statusResult.txHash.slice(0,18)}...`} />}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 flex-wrap">
                    {statusResult.status === 'approved' && (
                      <button className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                        onClick={() => doAction('disburse')} disabled={actionLoading === 'disburse'}
                      >
                        {actionLoading === 'disburse' ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                        DISBURSE
                      </button>
                    )}
                    {statusResult.status === 'disbursed' && (
                      <button className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5"
                        onClick={() => doAction('repay')} disabled={actionLoading === 'repay'}
                      >
                        {actionLoading === 'repay' ? <RefreshCw size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                        REPAY
                      </button>
                    )}
                    <button className="btn-ghost text-xs py-2 px-4 flex items-center gap-1.5"
                      onClick={fetchStatus} disabled={statusLoading}
                    >
                      <RefreshCw size={10} className={statusLoading ? 'animate-spin' : ''} /> REFRESH
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
