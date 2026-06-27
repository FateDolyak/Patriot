import { useEffect, useRef } from 'react';
import { useSettings } from '../settings';

// Canvas fireworks over a flag-blue background. Disabled when animations are off.
export default function Fireworks() {
  const { animations } = useSettings();
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!animations) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let lastLaunch = 0;
    const particles = [];
    const COLORS = ['#ffffff', '#d4262f', '#3a6bd6', '#ffd24a', '#ff5a5f', '#7fb0ff'];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function burst(x, y) {
      const color = COLORS[(Math.random() * COLORS.length) | 0];
      const count = 60 + ((Math.random() * 40) | 0);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 1.5 + Math.random() * 3.5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.008 + Math.random() * 0.012,
          color,
          size: 1.5 + Math.random() * 1.5,
        });
      }
    }

    function frame(ts) {
      // Trailing fade for a glowing effect.
      ctx.fillStyle = 'rgba(3, 7, 20, 0.32)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (ts - lastLaunch > 750) {
        lastLaunch = ts;
        burst(
          canvas.width * (0.15 + Math.random() * 0.7),
          canvas.height * (0.12 + Math.random() * 0.45)
        );
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // gravity
        p.vx *= 0.99;
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [animations]);

  if (!animations) return null;
  return <canvas ref={canvasRef} className="fireworks-canvas" aria-hidden="true" />;
}
