/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cyan:  { DEFAULT: '#00f5ff', 400: '#22d3ee', 500: '#06b6d4', glow: '#00f5ff' },
        violet: { DEFAULT: '#a855f7', glow: '#c084fc' },
        gold:  { DEFAULT: '#f5c518', glow: '#fde68a' },
        dark:  {
          950: '#020408',
          900: '#060d16',
          800: '#0a1628',
          700: '#0f2040',
          600: '#162d5a',
        },
      },
      fontFamily: {
        display: ['"Orbitron"', 'sans-serif'],
        body:    ['"Syne"', 'sans-serif'],
        mono:    ['"Space Mono"', 'monospace'],
      },
      animation: {
        'float':        'float 6s ease-in-out infinite',
        'float-slow':   'float 9s ease-in-out infinite',
        'pulse-glow':   'pulseGlow 3s ease-in-out infinite',
        'scan-line':    'scanLine 4s linear infinite',
        'orbit':        'orbit 20s linear infinite',
        'shimmer':      'shimmer 2.5s linear infinite',
        'count-up':     'countUp 1.2s cubic-bezier(0.16,1,0.3,1) forwards',
      },
      keyframes: {
        float:      { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-20px)' } },
        pulseGlow:  { '0%,100%': { opacity: '.7', filter: 'blur(8px)' }, '50%': { opacity: '1', filter: 'blur(14px)' } },
        scanLine:   { '0%': { top: '0%' }, '100%': { top: '100%' } },
        orbit:      { '0%': { transform: 'rotate(0deg) translateX(120px) rotate(0deg)' }, '100%': { transform: 'rotate(360deg) translateX(120px) rotate(-360deg)' } },
        shimmer:    { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        countUp:    { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
