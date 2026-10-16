import { useEffect, useRef, type MutableRefObject } from 'react';
import './hud.css';

// Màn hình HUD của Jarvis khi được gọi: vòng hạt sáng hội tụ quanh lõi, vòng HUD quay, chữ JARVIS nhiễu rồi rõ.
// Hiệu ứng đi theo trạng thái cuộc nói chuyện: giới thiệu (nhấp nháy theo từng từ Jarvis đọc) → đang nghe (vòng và tia
// sáng phản ứng theo âm lượng micro) → đang xử lý (vòng quay nhanh) → trả lời (nhấp nháy theo lời đọc, có phụ đề).
// Bấm chuột hoặc Esc để thu nhỏ về khung Jarvis; cuộc nói chuyện vẫn tiếp tục ở đó.

export type HudPhase = 'intro' | 'listening' | 'thinking' | 'speaking';

/** Tín hiệu cập nhật liên tục, không qua React state: âm lượng micro 0..1, xung lời nói 0..1. */
export type HudSignal = { level: number; pulse: number };

export const prefersReducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const LABEL: Record<HudPhase, string> = {
  intro: '',
  listening: 'Đang nghe',
  thinking: 'Đang xử lý',
  speaking: '',
};

const RINGS = [
  { radius: 0.3, speed: 0.55, count: 150 },
  { radius: 0.42, speed: -0.32, count: 210 },
  { radius: 0.56, speed: 0.2, count: 260 },
];

const COLORS: Record<HudPhase, string[]> = {
  intro: ['125, 211, 252', '56, 189, 248', '96, 165, 250'],
  listening: ['103, 232, 249', '34, 211, 238', '56, 189, 248'],
  thinking: ['147, 197, 253', '96, 165, 250', '129, 140, 248'],
  speaking: ['224, 242, 254', '125, 211, 252', '56, 189, 248'],
};

type Particle = { ring: number; angle: number; radius: number; size: number; alpha: number; from: number; fromAngle: number; delay: number };

function easeOut(value: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3);
}

export function JarvisHud({
  phase,
  caption,
  signal,
  leaving,
  onDismiss,
}: {
  phase: HudPhase;
  caption: string;
  signal: MutableRefObject<HudSignal>;
  leaving: boolean;
  onDismiss: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    // Bắt ở pha capture và chặn lan truyền: Esc chỉ thu nhỏ HUD, không đóng luôn khung Jarvis phía sau.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      dismissRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Vòng hạt và tia sáng: vẽ liên tục, đọc trạng thái và tín hiệu qua ref để không phải dựng lại.
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
    const spikes = Array.from({ length: 96 }, (_, index) => ({ angle: (index / 96) * Math.PI * 2, seed: Math.random() * 10 }));
    const begin = performance.now();
    let last = begin;
    let spin = 0;
    let amp = 0;
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = now - begin;
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const current = phaseRef.current;
      const colors = COLORS[current];
      // Xung lời nói tắt dần; âm lượng micro đã được làm mượt ở nơi đo.
      signal.current.pulse *= Math.pow(0.02, dt);
      const target = current === 'listening' ? signal.current.level : current === 'speaking' || current === 'intro' ? signal.current.pulse : 0;
      amp += (target - amp) * Math.min(1, dt * 14);
      spin += dt * (current === 'thinking' ? 3.2 : 1);

      const width = element.width;
      const height = element.height;
      // Tâm và tỉ lệ theo khung vòng HUD (SVG 400 đơn vị, vòng ngoài bán kính 150 ≈ 0,56 × unit) để hạt và vòng đồng tâm.
      const box = stage.current?.getBoundingClientRect();
      const host = element.getBoundingClientRect();
      const cx = box ? (box.left - host.left + box.width / 2) * ratio : width / 2;
      const cy = box ? (box.top - host.top + box.height / 2) * ratio : height / 2;
      const unit = box ? (box.width * ratio * (150 / 400)) / 0.56 : Math.min(width, height) * 0.62;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      for (const particle of particles) {
        const ring = RINGS[particle.ring];
        const t = easeOut((elapsed - particle.delay) / 720);
        const swell = 1 + amp * (0.1 + particle.ring * 0.05);
        const radius = (particle.from + (particle.radius * swell - particle.from) * t) * unit;
        const angle = particle.angle + particle.fromAngle * (1 - t) + ring.speed * spin;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const flicker = 0.75 + 0.25 * Math.sin(elapsed / 90 + particle.angle * 7);
        context.fillStyle = `rgba(${colors[particle.ring]}, ${Math.min(1, particle.alpha * t * flicker * (0.85 + amp * 0.6))})`;
        context.beginPath();
        context.arc(x, y, particle.size * ratio * (1 + amp * 0.5), 0, Math.PI * 2);
        context.fill();
      }
      // Tia sáng quanh lõi: dài theo âm lượng khi nghe, theo lời nói khi Jarvis đọc.
      if (current !== 'intro' || elapsed > 600) {
        const inner = unit * 0.2;
        context.lineCap = 'round';
        for (const spike of spikes) {
          const wobble = 0.35 + 0.65 * Math.abs(Math.sin(elapsed / 140 + spike.seed * 3 + spike.angle * 4));
          const length = unit * (0.012 + amp * 0.07 * wobble + (current === 'thinking' ? 0.02 * wobble : 0));
          const angle = spike.angle + spin * 0.15;
          context.strokeStyle = `rgba(${colors[1]}, ${0.25 + amp * 0.6})`;
          context.lineWidth = 1.6 * ratio;
          context.beginPath();
          context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
          context.lineTo(cx + Math.cos(angle) * (inner + length), cy + Math.sin(angle) * (inner + length));
          context.stroke();
        }
      }
      // Lõi phát sáng
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.24);
      const pulse = 0.5 + 0.2 * Math.sin(elapsed / 160) + amp * 0.6;
      glow.addColorStop(0, `rgba(186, 230, 253, ${0.3 * pulse})`);
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
  }, [signal]);

  const label = LABEL[phase];
  return (
    <div className={`jv-summon phase-${phase}${leaving ? ' leaving' : ''}`} onPointerDown={() => dismissRef.current()} role="dialog" aria-label="Jarvis" aria-live="polite">
      <canvas ref={canvas} className="jv-canvas" aria-hidden />
      <div className="jv-stage" ref={stage} aria-hidden>
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
      <div className="jv-caption">
        {label && <div className="jv-label">{label}</div>}
        <div className="jv-greeting" key={phase}>
          {caption.length > 220 ? `…${caption.slice(-220).replace(/^\S*\s/, '')}` : caption}
          {(phase === 'intro' || phase === 'speaking' || phase === 'listening') && <span className="jv-caret" />}
        </div>
      </div>
    </div>
  );
}
