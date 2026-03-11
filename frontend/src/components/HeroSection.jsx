import { motion } from 'framer-motion';
import { ArrowRight, Shield, Cpu, Zap, GitBranch, Lock } from 'lucide-react';

const feats = [
  { icon: Cpu,       label: 'ML Credit Scoring',     sub: 'Logistic regression + 6 on-chain features' },
  { icon: Zap,       label: 'Groq LLM Reasoning',    sub: 'Mixtral 40% qualitative weight' },
  { icon: GitBranch, label: 'Risk-Tiered Lending',    sub: 'Tiers A → D with adaptive APR' },
  { icon: Lock,      label: 'WDK On-Chain Disburse',  sub: 'Tether Sepolia USDT transfers' },
];

const tiers = [
  { tier:'A', range:'80–100', apr:'4%',  max:'10,000',  col:'None',        cls:'tier-A' },
  { tier:'B', range:'60–79',  apr:'9%',  max:'3,000',   col:'25%',         cls:'tier-B' },
  { tier:'C', range:'40–59',  apr:'18%', max:'500',     col:'50%',         cls:'tier-C' },
  { tier:'D', range:'0–39',   apr:'—',   max:'Denied',  col:'—',           cls:'tier-D' },
];

const staggerParent = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } },
};

export default function HeroSection({ onNav }) {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 overflow-hidden grid-lines"
    >
      {/* Central 3-D orb decoration */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
        {/* Outer ring */}
        <div className="w-[500px] h-[500px] rounded-full border border-cyan-400/10 anim-spin-slow" />
        {/* Mid ring offset */}
        <div className="absolute inset-10 rounded-full border border-violet-500/10" style={{ animation: 'spin-slow 30s linear infinite reverse' }} />
        {/* Core glow */}
        <div className="absolute inset-[180px] rounded-full bg-gradient-radial from-cyan-400/12 to-transparent anim-pulse-glow" />
        {/* Orbiting dots */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
          <div
            key={i}
            className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full"
            style={{
              background: i % 2 === 0 ? '#00f5ff' : '#a855f7',
              boxShadow: `0 0 6px ${i % 2 === 0 ? '#00f5ff' : '#a855f7'}`,
              transform: `rotate(${deg}deg) translateX(220px)`,
              animation: `orbit ${14 + i * 2}s linear infinite`,
              marginTop: '-3px', marginLeft: '-3px',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="relative z-10 text-center max-w-4xl mx-auto"
      >
        {/* Badge */}
        <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-8">
          <div className="glass anim-border-pulse px-4 py-1.5 rounded-full flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute h-full w-full rounded-full bg-cyan-400 opacity-70" />
              <span className="relative rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span className="font-mono text-[10px] text-cyan-400/80 tracking-[0.2em]">HACKATHON GALACTICA — WDK EDITION 1</span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1 variants={fadeUp} className="font-display font-black leading-none mb-4 tracking-tight select-none">
          <span className="block text-5xl md:text-7xl text-white/90 mb-1">AUTONOMOUS</span>
          <span className="block text-5xl md:text-7xl gradient-text">AI LENDING</span>
          <span className="block text-5xl md:text-7xl text-white/90">AGENT</span>
        </motion.h1>

        {/* Sub */}
        <motion.p variants={fadeUp} className="text-white/45 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed font-body">
          AI agents get a credit identity, scored by ML + LLM, and receive autonomous USD₮
          disbursements — no human in the loop.
        </motion.p>

        {/* CTAs */}
        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <button className="btn-primary flex items-center gap-2" onClick={() => onNav('dashboard')}>
            Launch Dashboard <ArrowRight size={13} />
          </button>
          <button className="btn-ghost" onClick={() => onNav('loans')}>
            Request Loan
          </button>
        </motion.div>

        {/* Feature cards */}
        <motion.div variants={staggerParent} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-16">
          {feats.map(({ icon: Icon, label, sub }) => (
            <motion.div key={label} variants={fadeUp}
              className="glass glass-hover rounded-lg p-4 text-left"
            >
              <Icon size={18} className="text-cyan-400 mb-3" />
              <div className="font-display text-[11px] text-white/80 tracking-wide mb-1">{label}</div>
              <div className="font-mono text-[10px] text-white/30 leading-relaxed">{sub}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Tier table */}
        <motion.div variants={fadeUp} className="glass rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
            <Shield size={12} className="text-cyan-400" />
            <span className="font-display text-[11px] text-white/50 tracking-widest">RISK TIERS</span>
          </div>
          <div className="grid grid-cols-5 gap-0">
            {['Tier','Score','APR','Max USDT','Collateral'].map(h => (
              <div key={h} className="px-4 py-2 font-mono text-[10px] text-white/25 tracking-wider border-b border-white/5">{h}</div>
            ))}
            {tiers.map(({ tier, range, apr, max, col, cls }) => (
              <div key={`tier-${tier}`} style={{ display: 'contents' }}>
                <div className="px-4 py-3">
                  <span className={`font-display text-xs font-bold px-2 py-0.5 rounded border ${cls}`}>{tier}</span>
                </div>
                <div className="px-4 py-3 font-mono text-xs text-white/50">{range}</div>
                <div className="px-4 py-3 font-mono text-xs text-white/50">{apr}</div>
                <div className="px-4 py-3 font-mono text-xs text-white/50">{max}</div>
                <div className="px-4 py-3 font-mono text-xs text-white/50">{col}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
