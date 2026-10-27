import { useMemo, type ReactNode } from 'react';
import type { PresetId } from '../types';
import type { Tone } from './tone';

// Bộ hình nền dựng sẵn: vẽ bằng CSS và SVG nên nhẹ, nét ở mọi độ phân giải, không cần mạng. Mỗi nền khai báo tông
// sáng/tối ở góc trên bên trái (nơi đặt lời chào) để chọn màu chữ.

type Rand = () => number;

function seeded(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fixed = (value: number) => Math.round(value * 10) / 10;

function Stars() {
  const stars = useMemo(() => {
    const rand = seeded(7);
    return Array.from({ length: 220 }, (_, index) => ({
      x: fixed(rand() * 1600),
      y: fixed(rand() * 1000),
      r: fixed(0.4 + rand() * rand() * 1.6),
      o: fixed(0.25 + rand() * 0.7),
      twinkle: index % 13 === 0,
    }));
  }, []);
  return (
    <svg className="bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="bg-milky" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="900" cy="420" rx="760" ry="150" fill="url(#bg-milky)" transform="rotate(-18 900 420)" />
      {stars.map((star, index) => (
        <circle key={index} className={star.twinkle ? 'bg-twinkle' : undefined} cx={star.x} cy={star.y} r={star.r} fill="#fff" opacity={star.o} style={star.twinkle ? { animationDelay: `${(index % 7) * 0.9}s` } : undefined} />
      ))}
    </svg>
  );
}

function Waves() {
  const layers = [
    { y: 560, amp: 26, color: '#9ccfe2', len: 380 },
    { y: 640, amp: 32, color: '#5aa9c9', len: 460 },
    { y: 730, amp: 36, color: '#2f84aa', len: 520 },
    { y: 830, amp: 40, color: '#165c82', len: 600 },
  ];
  return (
    <svg className="bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {layers.map((layer, index) => {
        let d = `M0 ${layer.y}`;
        for (let x = 0; x <= 1600; x += 20) d += ` L${x} ${fixed(layer.y + Math.sin((x / layer.len) * Math.PI * 2 + index) * layer.amp)}`;
        d += ' L1600 1000 L0 1000 Z';
        return <path key={index} d={d} fill={layer.color} opacity={0.92} />;
      })}
    </svg>
  );
}

function Trunks() {
  const trunks = useMemo(() => {
    const rand = seeded(23);
    return Array.from({ length: 46 }, () => ({ x: fixed(rand() * 1600), top: fixed(rand() * 380), lean: fixed((rand() - 0.5) * 30), w: fixed(1 + rand() * 3.5), o: fixed(0.06 + rand() * 0.18) }));
  }, []);
  return (
    <svg className="bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="bg-mist" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e9f5ee" stopOpacity="0" />
          <stop offset="0.7" stopColor="#e9f5ee" stopOpacity="0.16" />
          <stop offset="1" stopColor="#e9f5ee" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {trunks.map((trunk, index) => (
        <line key={index} x1={trunk.x} y1={1000} x2={trunk.x + trunk.lean} y2={trunk.top} stroke="#dfeee4" strokeWidth={trunk.w} opacity={trunk.o} />
      ))}
      <rect x="0" y="0" width="1600" height="1000" fill="url(#bg-mist)" />
    </svg>
  );
}

function Lotus() {
  const petals = [-70, -45, -22, 0, 22, 45, 70];
  return (
    <svg className="bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMaxYMax slice" aria-hidden>
      <g fill="none" strokeLinecap="round">
        <g stroke="#6f9a7c" opacity="0.32" strokeWidth="2">
          <ellipse cx="1180" cy="905" rx="250" ry="70" />
          <path d="M1180 905 L1000 870 M1180 905 L1080 845 M1180 905 L1200 836 M1180 905 L1330 850 M1180 905 L1400 900" />
          <ellipse cx="1470" cy="960" rx="190" ry="52" />
          <path d="M1250 760 C1255 820 1215 860 1185 900" strokeWidth="3" />
        </g>
        <g stroke="#c26d84" opacity="0.5" strokeWidth="2.4" transform="translate(1250 760)">
          {petals.map(angle => (
            <path key={angle} transform={`rotate(${angle})`} d="M0 0 C-34 -60 -24 -150 0 -190 C24 -150 34 -60 0 0 Z" />
          ))}
          <path d="M-46 -8 C-20 12 20 12 46 -8" />
        </g>
        <g stroke="#c26d84" opacity="0.28" strokeWidth="1.6" transform="translate(1480 820) scale(0.55)">
          {petals.map(angle => (
            <path key={angle} transform={`rotate(${angle})`} d="M0 0 C-34 -60 -24 -150 0 -190 C24 -150 34 -60 0 0 Z" />
          ))}
        </g>
      </g>
    </svg>
  );
}

function BronzeDrum() {
  const rings = [90, 150, 205, 260, 330, 400, 470];
  const birds = Array.from({ length: 18 }, (_, index) => index * 20);
  const star = Array.from({ length: 28 }, (_, index) => {
    const angle = (index * Math.PI) / 14 - Math.PI / 2;
    const radius = index % 2 === 0 ? 78 : 26;
    return `${fixed(500 + Math.cos(angle) * radius)},${fixed(500 + Math.sin(angle) * radius)}`;
  }).join(' ');
  return (
    <svg className="bg-svg bg-drum" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" stroke="#d9b56c">
        <polygon points={star} fill="#d9b56c" fillOpacity="0.16" strokeOpacity="0.35" />
        {rings.map((radius, index) => (
          <circle key={radius} cx="500" cy="500" r={radius} strokeOpacity={0.12 + (index % 2) * 0.08} strokeWidth={index % 3 === 0 ? 2.5 : 1.2} strokeDasharray={index % 2 ? '2 7' : undefined} />
        ))}
        <circle cx="500" cy="500" r="295" strokeOpacity="0.16" strokeWidth="14" strokeDasharray="3 9" />
        {birds.map(angle => (
          <path key={angle} transform={`rotate(${angle} 500 500) translate(500 135)`} d="M-22 6 L0 -8 L22 6 M-8 1 L0 -4 L8 1" strokeOpacity="0.28" strokeWidth="2" />
        ))}
      </g>
    </svg>
  );
}

function Glaze() {
  const cracks = useMemo(() => {
    const rand = seeded(91);
    return Array.from({ length: 90 }, () => {
      let x = rand() * 1600;
      let y = rand() * 1000;
      let d = `M${fixed(x)} ${fixed(y)}`;
      const steps = 3 + Math.floor(rand() * 4);
      let angle = rand() * Math.PI * 2;
      for (let step = 0; step < steps; step += 1) {
        angle += (rand() - 0.5) * 1.3;
        const length = 18 + rand() * 46;
        x += Math.cos(angle) * length;
        y += Math.sin(angle) * length;
        d += ` L${fixed(x)} ${fixed(y)}`;
      }
      return d;
    });
  }, []);
  // Băng trang trí ở chân bình: mép men lam lượn đều, hai đường chỉ, hàng chấm men.
  const foot = useMemo(() => {
    let d = 'M0 1000 L0 912';
    for (let x = 0; x <= 1600; x += 20) d += ` L${x} ${fixed(906 + Math.sin(x / 140) * 7)}`;
    return `${d} L1600 1000 Z`;
  }, []);
  const leaves = [
    { x: 1365, y: 150, r: -30 }, { x: 1420, y: 215, r: 25 }, { x: 1300, y: 230, r: -60 },
    { x: 1480, y: 120, r: 50 }, { x: 1250, y: 120, r: -10 },
  ];
  return (
    <svg className="bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="bg-cobalt" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2b5f9e" stopOpacity="0.7" />
          <stop offset="1" stopColor="#173a6b" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="bg-celadon" cx="0%" cy="100%" r="75%">
          <stop offset="0" stopColor="#4f8f82" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#7fb3a6" stopOpacity="0.18" />
          <stop offset="1" stopColor="#a9cfc4" stopOpacity="0" />
        </radialGradient>
        <filter id="bg-soft" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <rect x="0" y="0" width="1600" height="1000" fill="url(#bg-celadon)" />
      <path filter="url(#bg-soft)" fill="url(#bg-cobalt)" d={foot} />
      <g stroke="#1f4e8c" fill="none" opacity="0.55">
        <path d="M0 876 C400 868 1200 884 1600 872" strokeWidth="3" />
        <path d="M0 860 C400 852 1200 868 1600 856" strokeWidth="1.4" />
      </g>
      <g fill="#1f4e8c" opacity="0.45">
        {Array.from({ length: 27 }, (_, index) => (
          <circle key={index} cx={index * 60 + 30} cy={fixed(889 + Math.sin(index) * 1.5)} r="4.5" />
        ))}
      </g>
      <g fill="none" stroke="#1f4e8c" strokeWidth="1" opacity="0.12">
        {cracks.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </g>
      <g stroke="#1f4e8c" strokeLinecap="round" opacity="0.5">
        <path d="M1560 40 C1480 90 1420 140 1360 190 C1310 232 1260 250 1200 262" fill="none" strokeWidth="5" />
        {leaves.map(leaf => (
          <path key={`${leaf.x}-${leaf.y}`} d="M-38 0 C-14 -16 14 -16 38 0 C14 16 -14 16 -38 0 Z" transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.r})`} fill="#1f4e8c" fillOpacity="0.6" strokeWidth="1.2" />
        ))}
        {[{ x: 1205, y: 262 }, { x: 1515, y: 70 }].map(flower => (
          <g key={flower.x} transform={`translate(${flower.x} ${flower.y})`}>
            {[0, 72, 144, 216, 288].map(angle => (
              <ellipse key={angle} cx="0" cy="-15" rx="8" ry="15" transform={`rotate(${angle})`} fill="#1f4e8c" fillOpacity="0.4" strokeWidth="1.2" />
            ))}
            <circle r="5" fill="#f4f8fb" stroke="none" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function Contours() {
  const paths = useMemo(() => {
    const rand = seeded(42);
    const centers = [
      { x: 360, y: 300, rings: 11, base: 34 },
      { x: 1180, y: 640, rings: 13, base: 30 },
      { x: 1350, y: 180, rings: 7, base: 40 },
    ];
    const list: string[] = [];
    for (const center of centers) {
      const harmonics = Array.from({ length: 4 }, (_, index) => ({ k: index + 2, a: 0.08 + rand() * 0.12, p: rand() * Math.PI * 2 }));
      for (let ring = 1; ring <= center.rings; ring += 1) {
        const radius = ring * center.base;
        let d = '';
        for (let step = 0; step <= 72; step += 1) {
          const theta = (step / 72) * Math.PI * 2;
          const wobble = harmonics.reduce((sum, h) => sum + h.a * Math.sin(h.k * theta + h.p + ring * 0.15), 0);
          const r = radius * (1 + wobble);
          d += `${step ? ' L' : 'M'}${fixed(center.x + Math.cos(theta) * r)} ${fixed(center.y + Math.sin(theta) * r * 0.82)}`;
        }
        list.push(`${d} Z`);
      }
    }
    return list;
  }, []);
  return (
    <svg className="bg-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" stroke="#b9dcef" strokeWidth="1.2">
        {paths.map((d, index) => (
          <path key={index} d={d} opacity={index % 5 === 0 ? 0.32 : 0.16} />
        ))}
      </g>
    </svg>
  );
}

function Grain({ opacity, frequency = 0.9 }: { opacity: number; frequency?: number }) {
  return (
    <svg className="bg-svg" aria-hidden>
      <filter id={`bg-grain-${frequency}`}>
        <feTurbulence type="fractalNoise" baseFrequency={frequency} numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#bg-grain-${frequency})`} opacity={opacity} />
    </svg>
  );
}

export interface Preset {
  id: PresetId;
  name: string;
  tone: Tone;
  animated?: boolean;
  render: () => ReactNode;
}

export const PRESETS: Preset[] = [
  { id: 'binh-minh', name: 'Bình minh', tone: 'light', render: () => null },
  { id: 'trua', name: 'Trời trưa', tone: 'light', render: () => null },
  { id: 'hoang-hon', name: 'Hoàng hôn', tone: 'dark', render: () => <div className="bg-sun" /> },
  { id: 'dem-sao', name: 'Đêm sao', tone: 'dark', render: () => <Stars /> },
  {
    id: 'cuc-quang', name: 'Cực quang', tone: 'dark', animated: true,
    render: () => (
      <>
        <div className="bg-aurora a1" />
        <div className="bg-aurora a2" />
        <div className="bg-aurora a3" />
        <Stars />
      </>
    ),
  },
  { id: 'bien', name: 'Biển', tone: 'light', render: () => <Waves /> },
  { id: 'rung-tram', name: 'Rừng tràm', tone: 'dark', render: () => <Trunks /> },
  { id: 'sen', name: 'Sen', tone: 'light', render: () => <Lotus /> },
  { id: 'trong-dong', name: 'Trống đồng', tone: 'dark', render: () => <BronzeDrum /> },
  { id: 'gom', name: 'Men gốm Lái Thiêu', tone: 'light', render: () => <Glaze /> },
  { id: 'dia-hinh', name: 'Địa hình', tone: 'dark', render: () => <Contours /> },
  { id: 'kinh', name: 'Kính mờ', tone: 'light', render: () => null },
  { id: 'than-chi', name: 'Than chì', tone: 'dark', render: () => <Grain opacity={0.08} /> },
  { id: 'giay', name: 'Giấy dó', tone: 'light', render: () => <Grain opacity={0.22} frequency={0.65} /> },
  { id: 'luoi-xanh', name: 'Lưới xanh', tone: 'dark', render: () => null },
];

const BY_ID = new Map(PRESETS.map(preset => [preset.id, preset]));

export function presetOf(id: PresetId): Preset {
  return BY_ID.get(id) ?? PRESETS[0];
}

export function presetTone(id: PresetId): Tone {
  return presetOf(id).tone;
}

/** Vẽ một nền dựng sẵn phủ kín khung chứa (khung phải có position: relative/absolute/fixed). */
export function PresetLayer({ id }: { id: PresetId }) {
  const preset = presetOf(id);
  return <div className={`bg-preset bg-${preset.id}`}>{preset.render()}</div>;
}
