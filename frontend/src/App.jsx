import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StarField       from './components/StarField';
import NavBar          from './components/NavBar';
import HeroSection     from './components/HeroSection';
import DashboardSection from './components/DashboardSection';
import LoansSection    from './components/LoansSection';
import CapitalSection  from './components/CapitalSection';
import './index.css';

// Smooth-scroll to section by id
function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Determine active section via IntersectionObserver
function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return [active, setActive];
}

// Custom cursor
function Cursor() {
  const dotRef   = useRef(null);
  const ringRef  = useRef(null);

  useEffect(() => {
    const move = e => {
      if (dotRef.current)  { dotRef.current.style.left  = `${e.clientX}px`; dotRef.current.style.top  = `${e.clientY}px`; }
      if (ringRef.current) { ringRef.current.style.left = `${e.clientX}px`; ringRef.current.style.top = `${e.clientY}px`; }
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <>
      <div ref={dotRef}  className="cursor" />
      <div ref={ringRef} className="cursor-trail" />
    </>
  );
}

const SECTIONS = ['hero', 'dashboard', 'loans', 'capital'];

export default function App() {
  const [active, setActive] = useActiveSection(SECTIONS);

  const nav = id => { setActive(id); scrollTo(id); };

  return (
    <div className="relative min-h-screen bg-[#020408]">
      {/* Custom cursor */}
      <Cursor />

      {/* Animated starfield background */}
      <StarField />

      {/* Navigation */}
      <NavBar active={active} onNav={nav} />

      {/* Pages */}
      <main className="relative z-10">
        <HeroSection    onNav={nav} />
        <DashboardSection />
        <LoansSection   />
        <CapitalSection />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8 px-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-mono text-[10px] text-white/20 tracking-widest">
            SENTINEL v0.1 · HACKATHON GALACTICA · WDK EDITION 1 · MARCH 2026
          </div>
          <div className="flex items-center gap-6">
            {SECTIONS.map(id => (
              <button key={id} onClick={() => nav(id)}
                className="font-display text-[10px] text-white/20 hover:text-cyan-400 tracking-widest transition-colors uppercase"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
