import { memo, useId } from 'react';
import { EXTRA_WALLPAPERS } from './catalog';
import './background.css';

export { EXTRA_WALLPAPERS } from './catalog';

// Adapted from claude/ioc-system-redesign-54cca5-qubd0m (0b86aa8), desk/background/presets.tsx.
// Hình nền CSS/SVG: nhẹ, nét ở mọi độ phân giải và không cần mạng.
// Colours and composition are tuned for the workspace's dark glass panels.
function seeded(seed: number) {
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

const stars = (() => {
  const random = seeded(7);
  return Array.from({ length: 220 }, () => ({
    x: fixed(random() * 1600), y: fixed(random() * 1000),
    radius: fixed(0.4 + random() * random() * 1.6), opacity: fixed(0.25 + random() * 0.7),
  }));
})();

const trunks = (() => {
  const random = seeded(23);
  return Array.from({ length: 46 }, () => ({
    x: fixed(random() * 1600), top: fixed(random() * 380), lean: fixed((random() - 0.5) * 30),
    width: fixed(1 + random() * 3.5), opacity: fixed(0.06 + random() * 0.18),
  }));
})();

const cracks = (() => {
  const random = seeded(91);
  return Array.from({ length: 90 }, () => {
    let x = random() * 1600;
    let y = random() * 1000;
    let angle = random() * Math.PI * 2;
    let path = `M${fixed(x)} ${fixed(y)}`;
    const steps = 3 + Math.floor(random() * 4);
    for (let step = 0; step < steps; step++) {
      angle += (random() - 0.5) * 1.3;
      const length = 18 + random() * 46;
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
      path += ` L${fixed(x)} ${fixed(y)}`;
    }
    return path;
  });
})();

const contours = (() => {
  const random = seeded(42);
  const centers = [
    { x: 360, y: 300, rings: 11, base: 34 },
    { x: 1180, y: 640, rings: 13, base: 30 },
    { x: 1350, y: 180, rings: 7, base: 40 },
  ];
  return centers.flatMap((center) => {
    const harmonics = Array.from({ length: 4 }, (_, index) => ({
      k: index + 2, amplitude: 0.08 + random() * 0.12, phase: random() * Math.PI * 2,
    }));
    return Array.from({ length: center.rings }, (_, index) => {
      const ring = index + 1;
      let path = '';
      for (let step = 0; step <= 72; step++) {
        const theta = (step / 72) * Math.PI * 2;
        const wobble = harmonics.reduce((sum, h) => sum + h.amplitude * Math.sin(h.k * theta + h.phase + ring * 0.15), 0);
        const radius = ring * center.base * (1 + wobble);
        const x = fixed(center.x + Math.cos(theta) * radius);
        const y = fixed(center.y + Math.sin(theta) * radius * 0.82);
        path += `${step === 0 ? 'M' : ' L'}${x} ${y}`;
      }
      return `${path} Z`;
    });
  });
})();

const drumStar = Array.from({ length: 28 }, (_, index) => {
  const angle = (index * Math.PI) / 14 - Math.PI / 2;
  const radius = index % 2 === 0 ? 110 : 37;
  return `${fixed(Math.cos(angle) * radius)},${fixed(Math.sin(angle) * radius)}`;
}).join(' ');

function Night({ id }: { id: string }) {
  return <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs><radialGradient id={`${id}-milky`}><stop stopColor="#a5b4fc" stopOpacity=".23" /><stop offset="1" stopColor="#a5b4fc" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="1030" cy="420" rx="850" ry="190" transform="rotate(-22 1030 420)" fill={`url(#${id}-milky)`} />
    {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.radius} fill="#e8efff" opacity={star.opacity} />)}
    <path d="M0 925 L230 850 L360 920 L560 835 L740 890 L980 780 L1250 900 L1470 840 L1600 900 V1000 H0Z" fill="#070f22" opacity=".7" />
  </svg>;
}

function Forest({ id }: { id: string }) {
  return <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id={`${id}-mist`} x2="0" y2="1"><stop stopColor="#d3eee2" stopOpacity="0" /><stop offset=".75" stopColor="#c0e4d5" stopOpacity=".14" /><stop offset="1" stopColor="#a1d1bd" stopOpacity=".03" /></linearGradient></defs>
    {trunks.map((trunk, index) => <line key={index} x1={trunk.x} y1="1000" x2={trunk.x + trunk.lean} y2={trunk.top} stroke="#dfeee4" strokeWidth={trunk.width} opacity={trunk.opacity} />)}
    <rect width="1600" height="1000" fill={`url(#${id}-mist)`} />
    <path d="M0 810 Q350 690 700 835 T1600 780 V1000 H0Z" fill="#0c201c" opacity=".52" />
  </svg>;
}

const petals = [-70, -45, -22, 0, 22, 45, 70];
function Lotus() {
  return <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMaxYMax slice">
    <g stroke="#79b5a1" strokeOpacity=".32" strokeWidth="2" fill="none">
      <ellipse cx="1180" cy="905" rx="250" ry="70" />
      <path d="M1180 905 L1000 870 M1180 905 L1080 845 M1180 905 L1200 836 M1180 905 L1330 850 M1180 905 L1400 900" />
      <ellipse cx="1470" cy="960" rx="190" ry="52" />
      <path d="M1250 760 C1255 820 1215 860 1185 900" strokeWidth="3" />
      <ellipse cx="1120" cy="925" rx="410" ry="110" strokeOpacity=".18" />
    </g>
    <g transform="translate(1250 760)" stroke="#efb0c8" strokeOpacity=".62" strokeWidth="2.4" fill="#d899b3" fillOpacity=".035">
      {petals.map((angle) => <path key={angle} transform={`rotate(${angle})`} d="M0 0 C-34 -60 -24 -150 0 -190 C24 -150 34 -60 0 0 Z" />)}
      <path d="M-46 -8 C-20 12 20 12 46 -8" />
    </g>
    <g transform="translate(1480 820) scale(.55)" stroke="#e5a2be" strokeOpacity=".36" strokeWidth="1.6" fill="none">
      {petals.map((angle) => <path key={angle} transform={`rotate(${angle})`} d="M0 0 C-34 -60 -24 -150 0 -190 C24 -150 34 -60 0 0 Z" />)}
    </g>
  </svg>;
}

function BronzeDrum() {
  return <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <g transform="translate(1100 560)" stroke="#d9b56c" fill="none">
      <polygon points={drumStar} fill="#d9b56c" fillOpacity=".12" strokeOpacity=".36" />
      {[130, 190, 245, 300, 370, 440, 510, 590].map((radius, index) => <circle key={radius} r={radius} strokeOpacity={0.12 + (index % 2) * 0.08} strokeWidth={index % 3 === 0 ? 2.5 : 1.2} strokeDasharray={index % 2 ? '2 7' : undefined} />)}
      <circle r="335" strokeOpacity=".17" strokeWidth="14" strokeDasharray="3 9" />
      <circle r="550" strokeOpacity=".11" strokeWidth="24" strokeDasharray="2 14" />
      {Array.from({ length: 18 }, (_, index) => <path key={index} transform={`rotate(${index * 20}) translate(0 -405)`} d="M-25 7 L0 -10 L25 7 M-10 1 L0 -5 L10 1" strokeOpacity=".34" strokeWidth="2" />)}
    </g>
  </svg>;
}

const glazeLeaves = [
  { x: 1365, y: 150, rotation: -30 }, { x: 1420, y: 215, rotation: 25 },
  { x: 1300, y: 230, rotation: -60 }, { x: 1480, y: 120, rotation: 50 }, { x: 1250, y: 120, rotation: -10 },
];

function Glaze({ id }: { id: string }) {
  return <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id={`${id}-cobalt`}><stop stopColor="#3c7a9d" stopOpacity=".7" /><stop offset="1" stopColor="#3a678a" stopOpacity=".9" /></linearGradient>
      <radialGradient id={`${id}-celadon`} cx="0%" cy="100%" r="80%"><stop stopColor="#6eb3a0" stopOpacity=".22" /><stop offset=".6" stopColor="#7fb3a6" stopOpacity=".06" /><stop offset="1" stopColor="#a9cfc4" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="1600" height="1000" fill={`url(#${id}-celadon)`} />
    <path d="M0 914 Q400 892 800 912 T1600 906 V1000 H0Z" fill={`url(#${id}-cobalt)`} opacity=".35" />
    <g stroke="#78b1c0" fill="none" opacity=".45"><path d="M0 876 C400 868 1200 884 1600 872" strokeWidth="3" /><path d="M0 860 C400 852 1200 868 1600 856" strokeWidth="1.4" /></g>
    {Array.from({ length: 27 }, (_, index) => <circle key={index} cx={index * 60 + 30} cy={889 + Math.sin(index) * 1.5} r="4.5" fill="#78b1c0" opacity=".3" />)}
    <g stroke="#83b7bd" strokeWidth="1" opacity=".12" fill="none">{cracks.map((path, index) => <path key={index} d={path} />)}</g>
    <g stroke="#8dbcc9" opacity=".54" strokeLinecap="round">
      <path d="M1560 40 C1480 90 1420 140 1360 190 C1310 232 1260 250 1200 262" strokeWidth="5" fill="none" />
      {glazeLeaves.map((leaf) => <path key={leaf.x} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rotation})`} d="M-38 0 C-14 -16 14 -16 38 0 C14 16 -14 16 -38 0 Z" fill={`url(#${id}-cobalt)`} fillOpacity=".6" strokeWidth="1.2" />)}
      {[{ x: 1205, y: 262 }, { x: 1515, y: 70 }].map((flower) => <g key={flower.x} transform={`translate(${flower.x} ${flower.y})`}>
        {[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} transform={`rotate(${angle})`} cx="0" cy="-15" rx="8" ry="15" fill={`url(#${id}-cobalt)`} fillOpacity=".4" strokeWidth="1.2" />)}
        <circle r="5" fill="#c2e2dc" stroke="none" />
      </g>)}
    </g>
  </svg>;
}

function Contours() {
  return <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><g stroke="#b9dcef" strokeWidth="1.2" fill="none">
    {contours.map((path, index) => <path key={index} d={path} opacity={index % 5 === 0 ? 0.29 : 0.13} />)}
  </g></svg>;
}

function Dawn({ id }: { id: string }) {
  return <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs><radialGradient id={`${id}-sun`}><stop stopColor="#f3bc87" stopOpacity=".3" /><stop offset="1" stopColor="#f3bc87" stopOpacity="0" /></radialGradient></defs>
    <circle cx="1260" cy="480" r="390" fill={`url(#${id}-sun)`} />
    <circle cx="1260" cy="480" r="100" fill="#eab588" opacity=".65" />
    <path d="M0 745 Q170 580 350 680 T650 650 T950 700 T1260 610 T1600 670 V1000 H0Z" fill="#4b4a5d" opacity=".8" />
    <path d="M0 825 Q250 670 480 780 T930 790 T1300 760 T1600 780 V1000 H0Z" fill="#293b4c" />
    <path d="M0 900 Q300 820 560 905 T1060 880 T1600 900 V1000 H0Z" fill="#172c3c" />
  </svg>;
}

/** Can render in either the full-viewport backdrop or a positioned thumbnail. */
export const WallpaperArtwork = memo(function WallpaperArtwork({ preset }: { preset: string }) {
  const id = `ws-art-${useId().replace(/:/g, '')}`;
  if (!EXTRA_WALLPAPERS.some((wallpaper) => wallpaper.id === preset)) return null;
  return <div className={`ws-artwork ws-artwork--${preset}`} aria-hidden="true">
    {preset === 'gom' && <Glaze id={id} />}
    {preset === 'trong-dong' && <BronzeDrum />}
    {preset === 'dem-sao' && <Night id={id} />}
    {preset === 'rung-tram' && <Forest id={id} />}
    {preset === 'sen' && <Lotus />}
    {preset === 'dia-hinh' && <Contours />}
    {preset === 'binh-minh' && <Dawn id={id} />}
  </div>;
});
