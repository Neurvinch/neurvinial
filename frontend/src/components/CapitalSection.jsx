import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, AlertTriangle, RefreshCw, BarChart3, Layers } from 'lucide-react';
import { api } from '../api';

function MetricCard({ label, value, unit, color, icon: Icon, sub, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
      transition={{ duration:0.6, delay, ease:[0.16,1,0.3,1] }}
      className="glass glass-hover rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[10px] text-white/30 tracking-widest">{label}</span>
        <div className="w-7 h-7 rounded flex items-center justify-center"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
          <Icon size={12} style={{ color }} />
        </div>
      </div>
      <div className="font-display text-2xl font-bold mb-1" style={{ color, textShadow:`0 0 18px ${color}60` }}>
        {value ?? '—'}
      </div>
      {unit && <div className="font-mono text-[10px] text-white/25">{unit}</div>}
      {sub  && <div className="font-mono text-[10px] text-white/20 mt-2">{sub}</div>}
    </motion.div>
  );
}

function ProgressBar({ pct = 0, color = '#00f5ff', label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] text-white/30 tracking-wider">{label}</span>
        <span className="font-mono text-[10px]" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, pct)}%` }}
          viewport={{ once:true }} transition={{ duration:1.2, ease:[0.16,1,0.3,1] }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow:`0 0 8px ${color}60` }}
        />
      </div>
    </div>
  );
}

export default function CapitalSection() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.capitalStatus();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deployed    = data?.deployedCapital    ?? 0;
  const idle        = data?.idleCapital        ?? 0;
  const total       = (data?.totalCapital ?? (deployed + idle)) || 1;
  const earned      = data?.totalInterestEarned ?? 0;
  const lost        = data?.capitalLost        ?? 0;
  const deployedPct = (deployed / total) * 100;
  const idlePct     = (idle    / total) * 100;

  return (
    <section id="capital" className="relative min-h-screen px-6 pt-28 pb-20">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity:0,y:20 }} whileInView={{ opacity:1,y:0 }} viewport={{ once:true }}
          transition={{ duration:0.6 }} className="mb-10 flex items-end justify-between"
        >
          <div>
            <div className="font-mono text-[10px] text-gold/50 tracking-[0.3em] mb-2" style={{ color:'rgba(245,197,24,.5)' }}>
              // TREASURY
            </div>
            <h2 className="font-display text-3xl font-bold" style={{
              background:'linear-gradient(135deg,#f5c518,#a855f7)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text'
            }}>
              Capital Overview
            </h2>
          </div>
          <button className="btn-ghost flex items-center gap-2 text-xs" onClick={load} disabled={loading}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            REFRESH
          </button>
        </motion.div>

        {error && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-6">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-display text-xs text-red-400 mb-1">CONNECTION ERROR</div>
              <p className="font-mono text-[11px] text-red-400/70">{error}</p>
              <p className="font-mono text-[10px] text-white/25 mt-1">Ensure the Sentinel backend is running on port 3000</p>
            </div>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard label="TOTAL CAPITAL"    value={total.toLocaleString()}    unit="USDT" color="#00f5ff" icon={Wallet}       delay={0}    />
          <MetricCard label="DEPLOYED"         value={deployed.toLocaleString()} unit="USDT" color="#a855f7" icon={Layers}       delay={0.07} />
          <MetricCard label="INTEREST EARNED"  value={earned.toLocaleString()}   unit="USDT" color="#4ade80" icon={TrendingUp}   delay={0.14} />
          <MetricCard label="CAPITAL LOST"     value={lost.toLocaleString()}     unit="USDT" color="#f87171" icon={AlertTriangle} delay={0.21} />
        </div>

        {/* Allocation breakdown */}
        <motion.div initial={{ opacity:0,y:24 }} whileInView={{ opacity:1,y:0 }} viewport={{ once:true }}
          transition={{ duration:0.7 }} className="glass rounded-xl p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={14} className="text-cyan-400" />
            <span className="font-display text-sm tracking-widest text-white/60">ALLOCATION</span>
          </div>
          <div className="space-y-4">
            <ProgressBar label="DEPLOYED CAPITAL" value={`${deployedPct.toFixed(1)}%`} pct={deployedPct} color="#a855f7" />
            <ProgressBar label="IDLE CAPITAL"     value={`${idlePct.toFixed(1)}%`}     pct={idlePct}     color="#00f5ff" />
            <ProgressBar label="INTEREST YIELD"
              value={total > 0 ? `${((earned / total) * 100).toFixed(2)}%` : '0%'}
              pct={total > 0 ? (earned / total) * 100 : 0}
              color="#4ade80"
            />
          </div>
        </motion.div>

        {/* Yield opportunities */}
        <motion.div initial={{ opacity:0,y:24 }} whileInView={{ opacity:1,y:0 }} viewport={{ once:true }}
          transition={{ duration:0.7, delay:0.1 }} className="glass rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={14} style={{ color:'#f5c518' }} />
            <span className="font-display text-sm tracking-widest text-white/60">YIELD OPPORTUNITIES</span>
            <span className="ml-auto font-mono text-[10px] text-white/20">STUB — Aave V3 + Compound pending</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { name:'Aave V3 USDT',     apy:'4.2%', risk:'LOW',    tvl:'$1.2B',   color:'#c084fc' },
              { name:'Compound USDT',    apy:'3.8%', risk:'LOW',    tvl:'$890M',   color:'#67e8f9' },
              { name:'Sentinel Pool A',  apy:'9.0%', risk:'MEDIUM', tvl:'—',       color:'#fde68a' },
              { name:'Sentinel Pool B',  apy:'18.0%',risk:'HIGH',   tvl:'—',       color:'#fca5a5' },
            ].map(({ name, apy, risk, tvl, color }) => (
              <div key={name} className="flex items-center justify-between glass-hover border border-white/5 rounded-lg px-4 py-3">
                <div>
                  <div className="font-display text-xs text-white/70">{name}</div>
                  <div className="font-mono text-[10px] text-white/25 mt-0.5">TVL {tvl}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-sm font-bold" style={{ color }}>{apy}</div>
                  <div className="font-mono text-[10px] text-white/30">{risk} RISK</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
