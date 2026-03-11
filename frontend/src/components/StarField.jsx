import { useEffect, useRef } from 'react';

// Animated canvas — star field + drifting nebula orbs
export default function StarField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    let   raf;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Stars
    const STAR_COUNT = 220;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     Math.random() * 1.4 + 0.2,
      alpha: Math.random() * 0.6 + 0.2,
      speed: Math.random() * 0.18 + 0.04,
      drift: (Math.random() - 0.5) * 0.06,
    }));

    // Nebula orbs
    const orbs = [
      { x: 0.15, y: 0.25, r: 280, color: '0,245,255',   a: 0.07, speed: 0.0004, phase: 0 },
      { x: 0.82, y: 0.15, r: 220, color: '168,85,247',  a: 0.07, speed: 0.0006, phase: 1 },
      { x: 0.55, y: 0.75, r: 260, color: '245,197,24',  a: 0.045, speed: 0.0003, phase: 2 },
      { x: 0.92, y: 0.65, r: 180, color: '0,245,255',   a: 0.055, speed: 0.0007, phase: 3 },
    ];

    let t = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, W * 0.75);
      bg.addColorStop(0, 'rgba(5,12,28,1)');
      bg.addColorStop(1, 'rgba(2,4,8,1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Nebula orbs
      orbs.forEach(o => {
        const ox = (o.x + Math.sin(t * o.speed + o.phase) * 0.06) * W;
        const oy = (o.y + Math.cos(t * o.speed + o.phase) * 0.04) * H;
        const g  = ctx.createRadialGradient(ox, oy, 0, ox, oy, o.r);
        g.addColorStop(0, `rgba(${o.color},${o.a})`);
        g.addColorStop(1, `rgba(${o.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, o.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Stars
      stars.forEach(s => {
        s.y = (s.y + s.speed) % H;
        s.x += s.drift;
        if (s.x < 0) s.x = W;
        if (s.x > W) s.x = 0;

        const twinkle = s.alpha * (0.7 + 0.3 * Math.sin(t * 0.02 + s.x));
        ctx.globalAlpha = twinkle;
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      t++;
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  );
}
