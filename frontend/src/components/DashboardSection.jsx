import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Search, Shield, Activity, Clock, TrendingUp, AlertTriangle, Copy, CheckCheck } from 'lucide-react';
import { api } from '../api';

// Animated radial score ring
function ScoreRing({ score = 0 }) {
  const R   = 54;
  const C   = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  const color = score >= 80 ? '#00f5ff' : score >= 60 ? '#a855f7' : score >= 40 ? '#f5c518' : '#ef4444';
  const tier  = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';

  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg className="absolute inset-0 -rotate-90" width="128" height="128">
        <circle cx="64" cy="64" r={R} stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="none" />
        <circle
          cx="64" cy="64" r={R}
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="text-center z-10">
        <div className="font-display font-bold text-2xl" style={{ color }}>{score}</div>
        <div className={`font-display text-xs font-bold px-1.5 py-0.5 rounded border mt-1 tier-${tier}`}>TIER {tier}</div>
      </div>
    </div>
  );
}

// Copy DID button
function CopyDID({ did }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(did);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const short = `${did.slice(0, 20)}...${did.slice(-8)}`;
  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 glass px-3 py-1.5 rounded text-xs font-mono text-white/50 hover:text-cyan-400 hover:border-cyan-400/30 transition-all"
    >
      {short}
      {copied ? <CheckCheck size={11} className="text-cyan-400" /> : <Copy size={11} />}
    </button>
  );
}

// Stat card
function StatCard({ label, value, unit, icon: Icon, color = '#00f5ff' }) {
  return (
    <div className="glass glass-hover rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-white/30 tracking-widest">{label}</span>
        <Icon size={12} style={{ color }} />
      </div>
      <div className="font-display text-xl font-bold" style={{ color, textShadow: `0 0 12px ${color}60` }}>
        {value}
      </div>
      {unit && <div className="font-mono text-[10px] text-white/25 mt-0.5">{unit}</div>}
    </div>
  );
}

export default function DashboardSection() {
  const [name,         setName]         = useState('');
  const [loading,      setLoading]      = useState(false);
  const [agent,        setAgent]        = useState(null);
  const [error,        setError]        = useState('');
  const [lookupDid,    setLookupDid]    = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading,setLookupLoading]= useState(false);
  const [lookupError,  setLookupError]  = useState('');

  const register = async () => {
    if (!name.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await api.registerAgent({ name: name.trim() });
      setAgent(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const lookup = async () => {
    if (!lookupDid.trim()) return;
    setLookupLoading(true); setLookupError('');
    try {
      const res = await api.getScore(lookupDid.trim());
      setLookupResult(res);
    } catch (e) {
      setLookupError(e.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <section id="dashboard" className="relative min-h-screen px-6 pt-28 pb-20">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
          transition={{ duration:0.6 }} className="mb-10"
        >
          <div className="font-mono text-[10px] text-cyan-400/50 tracking-[0.3em] mb-2">// AGENT DASHBOARD</div>
          <h2 className="font-display text-3xl font-bold gradient-text-cv">Identity & Credit</h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">

          {/* ── Register ─────────────────────────────── */}
          <motion.div initial={{ opacity:0, x:-30 }} whileInView={{ opacity:1, x:0 }} viewport={{ once:true }}
            transition={{ duration:0.7 }} className="glass glass-hover rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <UserPlus size={16} className="text-cyan-400" />
              <span className="font-display text-sm tracking-widest text-white/70">REGISTER AGENT</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-white/30 tracking-widest block mb-1.5">AGENT NAME</label>
                <input
                  className="field"
                  placeholder="Alpha-7 / Borrower-01 / ..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && register()}
                />
              </div>

              <button
                className="btn-primary w-full"
                onClick={register}
                disabled={loading || !name.trim()}
              >
                {loading ? 'REGISTERING...' : 'REGISTER IDENTITY'}
              </button>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="font-mono text-[11px] text-red-400">{error}</span>
                </div>
              )}
            </div>

            {/* Agent card */}
            <AnimatePresence>
              {agent && (
                <motion.div
                  initial={{ opacity:0, y:20, scale:0.97 }}
                  animate={{ opacity:1, y:0, scale:1 }}
                  exit={{ opacity:0 }}
                  transition={{ duration:0.5 }}
                  className="mt-6 border border-cyan-400/15 rounded-lg p-5 bg-cyan-400/3"
                >
                  <div className="font-mono text-[10px] text-cyan-400/50 tracking-widest mb-4">// IDENTITY CREATED</div>
                  <div className="flex items-start gap-4">
                    <ScoreRing score={agent.creditScore ?? 50} />
                    <div className="flex-1 min-w-0 space-y-3 pt-1">
                      <div>
                        <div className="font-mono text-[10px] text-white/25 tracking-wider mb-1">DID</div>
                        <CopyDID did={agent.did} />
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-white/25 tracking-wider mb-1">WALLET</div>
                        <div className="font-mono text-[11px] text-white/50 truncate">{agent.walletAddress}</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Lookup ───────────────────────────────── */}
          <motion.div initial={{ opacity:0, x:30 }} whileInView={{ opacity:1, x:0 }} viewport={{ once:true }}
            transition={{ duration:0.7 }} className="glass glass-hover rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Search size={16} className="text-violet-400" />
              <span className="font-display text-sm tracking-widest text-white/70">CREDIT LOOKUP</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-white/30 tracking-widest block mb-1.5">AGENT DID</label>
                <input
                  className="field"
                  placeholder="did:sentinel:0x..."
                  value={lookupDid}
                  onChange={e => setLookupDid(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && lookup()}
                />
              </div>
              <button
                className="btn-secondary w-full"
                onClick={lookup}
                disabled={lookupLoading || !lookupDid.trim()}
              >
                {lookupLoading ? 'SCANNING...' : 'QUERY CREDIT SCORE'}
              </button>

              {lookupError && (
                <div className="flex items-start gap-2 p-3 rounded bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="font-mono text-[11px] text-red-400">{lookupError}</span>
                </div>
              )}
            </div>

            <AnimatePresence>
              {lookupResult && (
                <motion.div
                  initial={{ opacity:0, y:20, scale:0.97 }}
                  animate={{ opacity:1, y:0, scale:1 }}
                  exit={{ opacity:0 }}
                  transition={{ duration:0.5 }}
                  className="mt-6"
                >
                  <div className="font-mono text-[10px] text-violet-400/50 tracking-widest mb-4">// CREDIT PROFILE</div>
                  <div className="flex items-center gap-5 mb-5">
                    <ScoreRing score={lookupResult.creditScore ?? 0} />
                    <div className="space-y-1">
                      {lookupResult.isBlacklisted && (
                        <div className="font-mono text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-1 rounded">
                          ⛔ BLACKLISTED
                        </div>
                      )}
                      <div className="font-mono text-[10px] text-white/30">On-time rate</div>
                      <div className="font-display text-base text-white/80">
                        {((lookupResult.onTimeRate ?? 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="TOTAL LOANS"    value={lookupResult.totalLoans ?? 0}        icon={Activity}    color="#00f5ff" />
                    <StatCard label="REPAID"         value={lookupResult.totalRepaid ?? 0}       icon={TrendingUp}  color="#4ade80" />
                    <StatCard label="DEFAULTED"      value={lookupResult.totalDefaulted ?? 0}    icon={AlertTriangle} color="#f87171" />
                    <StatCard label="LAST ACTIVITY"  value={lookupResult.lastActivity
                      ? new Date(lookupResult.lastActivity).toLocaleDateString()
                      : '—'}
                      icon={Clock} color="#fbbf24" />
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
