import { useEffect, useRef, useState } from 'react';
import './summon.css';

// Hiệu ứng triệu hồi Jarvis: các vòng hạt sáng hội tụ quanh lõi, vòng HUD quay, chữ JARVIS nhiễu rồi rõ, lời chào.
// Khoảng 1,8 giây; bấm chuột hoặc phím bất kỳ để bỏ qua. Không chạy khi máy bật "giảm chuyển động".

const DURATION = 1850;
const EXIT = 380;
const GREETING = 'Xin chào, tôi là Jarvis.';

type Particle = { ring: number; angle: number; radius: number; size: number; alpha: number; from: number; fromAngle: number; delay: number };

const RINGS = [
  { radius: 0.3, speed: 0.55, count: 150, color: '125, 211, 252' },
  { radius: 0.42, speed: -0.32, count: 210, color: '56, 189, 248' },
  { radius: 0.56, speed: 0.2, count: 260, color: '96, 165, 250' },
];

export const prefersReducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function easeOut(value: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3);
}

export function JarvisSummon({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [typed, setTyped] = useState('');
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Kết thúc: thu nhỏ, mờ dần rồi báo xong — đúng một lần dù hết giờ, bấm chuột hay nhấn phím cùng lúc.
  const left = useRef(false);
  const finish = useRef(() => {
    if (left.current) return;
    left.current = true;
    setLeaving(true);
    window.setTimeout(() => doneRef.current(), EXIT);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => finish.current(), DURATION);
    const skip = () => finish.current();
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', skip);
    };
  }, []);

  // Lời chào gõ từng chữ.
  useEffect(() => {
    let index = 0;
    let timer = 0;
    const start = window.setTimeout(function tick() {
      index += 1;
      setTyped(GREETING.slice(0, index));
      if (index < GREETING.length) timer = window.setTimeout(tick, 28);
    }, 760);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
    };
  }, []);

  // Vòng hạt: mỗi hạt bay từ vị trí ngẫu nhiên xa tâm về vòng của nó, rồi quay theo vòng.
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      element.width = element.clientWidth * ratio;
      element.height = element.clientHeight * ratio;
    };
    resize();
    window.addEventListener('resize', resize);
    const particles: Particle[] = RINGS.flatMap((ring, index) =>
      Array.from({ length: ring.count }, () => ({
        ring: index,
        angle: Math.random() * Math.PI * 2,
        radius: ring.radius * (1 + (Math.random() - 0.5) * 0.07),
        size: 0.5 + Math.random() * 1.7,
        alpha: 0.35 + Math.random() * 0.65,
        from: ring.radius * (2.2 + Math.random() * 1.6),
        fromAngle: (Math.random() - 0.5) * 1.6,
        delay: Math.random() * 260,
      })),
    );
    const begin = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = now - begin;
      const width = element.width;
      const height = element.height;
      const unit = Math.min(width, height) * 0.62;
      const cx = width / 2;
      const cy = height / 2 - height * 0.04;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      for (const particle of particles) {
        const ring = RINGS[particle.ring];
        const t = easeOut((elapsed - particle.delay) / 720);
        const radius = (particle.from + (particle.radius - particle.from) * t) * unit;
        const angle = particle.angle + particle.fromAngle * (1 - t) + ring.speed * (elapsed / 1000);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const flicker = 0.75 + 0.25 * Math.sin(elapsed / 90 + particle.angle * 7);
        context.fillStyle = `rgba(${ring.color}, ${particle.alpha * t * flicker})`;
        context.beginPath();
        context.arc(x, y, particle.size * ratio, 0, Math.PI * 2);
        context.fill();
      }
      // Lõi phát sáng
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.24);
      const pulse = 0.55 + 0.25 * Math.sin(elapsed / 160);
      glow.addColorStop(0, `rgba(186, 230, 253, ${0.32 * pulse})`);
      glow.addColorStop(0.45, `rgba(56, 189, 248, ${0.12 * pulse})`);
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(cx, cy, unit * 0.24, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = 'source-over';
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className={`jv-summon${leaving ? ' leaving' : ''}`} onPointerDown={() => finish.current()} role="presentation" aria-hidden>
      <canvas ref={canvas} className="jv-canvas" />
      <div className="jv-stage">
        <svg className="jv-hud" viewBox="0 0 400 400">
          <g className="jv-ticks">
            {Array.from({ length: 90 }, (_, index) => (
              <line key={index} x1="200" y1={index % 5 === 0 ? 14 : 18} x2="200" y2="24" transform={`rotate(${index * 4} 200 200)`} />
            ))}
          </g>
          <circle className="jv-ring jv-ring-a" cx="200" cy="200" r="150" />
          <circle className="jv-ring jv-ring-b" cx="200" cy="200" r="122" />
          <circle className="jv-ring jv-ring-c" cx="200" cy="200" r="96" />
          <circle className="jv-core" cx="200" cy="200" r="58" />
        </svg>
        <div className="jv-word" data-text="JARVIS">
          JARVIS
        </div>
      </div>
      <div className="jv-greeting">
        {typed}
        <span className="jv-caret" />
      </div>
    </div>
  );
}
