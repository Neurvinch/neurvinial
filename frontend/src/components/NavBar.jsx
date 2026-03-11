import { motion } from 'framer-motion';
import { Shield, Activity, Cpu, Wallet } from 'lucide-react';

const links = [
  { id: 'hero',      label: 'HOME',      icon: Shield },
  { id: 'dashboard', label: 'DASHBOARD', icon: Cpu },
  { id: 'loans',     label: 'LOANS',     icon: Activity },
  { id: 'capital',   label: 'CAPITAL',   icon: Wallet },
];

export default function NavBar({ active, onNav }) {
  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 glass border-b border-white/5"
    >
      {/* Logo */}
      <button
        onClick={() => onNav('hero')}
        className="flex items-center gap-3 group"
      >
        <div className="relative w-9 h-9">
          <div className="absolute inset-0 rounded-full border border-cyan-400/40 group-hover:border-cyan-400/70 transition-colors" />
          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-400/20 to-violet-500/20 flex items-center justify-center">
            <Shield size={14} className="text-cyan-400" />
          </div>
          <div className="absolute inset-0 rounded-full anim-spin-slow border border-dashed border-cyan-400/20" />
        </div>
        <div>
          <div className="font-display text-sm font-bold neon-cyan tracking-widest leading-none">SENTINEL</div>
          <div className="font-mono text-[9px] text-white/30 tracking-widest">AI LENDER v0.1</div>
        </div>
      </button>

      {/* Nav links */}
      <div className="hidden md:flex items-center gap-1">
        {links.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded text-xs font-display tracking-widest transition-all duration-200
              ${active === id
                ? 'text-cyan-400'
                : 'text-white/40 hover:text-white/80'}`}
          >
            <Icon size={11} />
            {label}
            {active === id && (
              <motion.div
                layoutId="nav-indicator"
                className="absolute inset-0 rounded border border-cyan-400/30 bg-cyan-400/5"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Status dot */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
        </span>
        <span className="font-mono text-[10px] text-cyan-400/70 tracking-widest">ONLINE</span>
      </div>
    </motion.nav>
  );
}
