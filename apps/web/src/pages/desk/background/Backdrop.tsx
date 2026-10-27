import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { deskApi } from '../api';
import type { Background, PresetId } from '../types';
import { daylightPhase, type DaylightPhase } from './daylight';
import { presetTone, PresetLayer } from './presets';
import { toneOfBackground, toneOfLuminance, type Tone } from './tone';
import './background.css';

// Mặt bàn: vẽ hình nền phủ kín cửa sổ, sau khung quản trị. Trình chiếu và nền theo giờ chuyển cảnh mờ dần; ảnh đã bị
// xoá hoặc mất quyền thì rơi về nền theo giờ trong ngày, không bao giờ hiện ảnh vỡ.

type Frame = Exclude<Background, { kind: 'slideshow' } | { kind: 'daylight' }>;

const DAYLIGHT: Record<DaylightPhase, PresetId> = { dawn: 'binh-minh', day: 'trua', dusk: 'hoang-hon', night: 'dem-sao' };

function frameKey(frame: Frame) {
  return JSON.stringify(frame);
}

function useDaylight(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const { next } = daylightPhase(now);
    const timer = window.setTimeout(() => setNow(new Date()), Math.max(1000, next.getTime() - Date.now() + 500));
    return () => window.clearTimeout(timer);
  }, [active, now]);
  return DAYLIGHT[daylightPhase(now).id];
}

/** Khung hình đang hiện của một hình nền (trình chiếu đổi theo phút, nền theo giờ đổi theo chặng). */
function useFrame(background: Background): Frame {
  const daylight = useDaylight(background.kind === 'daylight');
  const slides = background.kind === 'slideshow' ? background.items : null;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (background.kind !== 'slideshow') return;
    setIndex(0);
    const count = background.items.length;
    const timer = window.setInterval(() => {
      setIndex(current => {
        if (!background.shuffle || count < 2) return (current + 1) % count;
        let next = current;
        while (next === current) next = Math.floor(Math.random() * count);
        return next;
      });
    }, background.minutes * 60_000);
    return () => window.clearInterval(timer);
  }, [background]);
  if (background.kind === 'daylight') return { kind: 'preset', id: daylight };
  if (slides) {
    const slide = slides[index % slides.length];
    return slide.kind === 'slideshow' || slide.kind === 'daylight' ? { kind: 'preset', id: daylight } : slide;
  }
  return background as Frame;
}

async function imageTone(url: string): Promise<Tone> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'dark';
  ctx.drawImage(image, 0, 0, 24, 24);
  // Lời chào nằm ở góc trên bên trái: lấy độ sáng trung bình vùng đó.
  const pixels = ctx.getImageData(0, 0, 14, 10).data;
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]].map(value => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return toneOfLuminance(total / (pixels.length / 4));
}

function ImageFrame({ frame, fallback, onTone }: { frame: Extract<Frame, { kind: 'image' }>; fallback: PresetId; onTone: (tone: Tone) => void }) {
  const [thumb, setThumb] = useState('');
  const [full, setFull] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setThumb('');
    setFull('');
    setFailed(false);
    void deskApi.assetBlobUrl(frame.assetId, 'thumb').then(url => {
      if (!alive) return;
      if (!url) return setFailed(true);
      setThumb(url);
      imageTone(url).then(tone => alive && onTone(tone)).catch(() => undefined);
    });
    void deskApi.assetBlobUrl(frame.assetId, 'full').then(url => {
      if (!alive) return;
      if (!url) return setFailed(true);
      setFull(url);
    });
    return () => {
      alive = false;
    };
  }, [frame.assetId, onTone]);
  useEffect(() => {
    if (failed) onTone(presetTone(fallback));
  }, [failed, fallback, onTone]);
  if (failed) return <PresetLayer id={fallback} />;
  const style: CSSProperties = {
    backgroundSize: frame.fit,
    backgroundPosition: `${frame.focus.x}% ${frame.focus.y}%`,
  };
  return (
    <>
      {thumb && !full && <div className="desk-backdrop-image" style={{ ...style, backgroundImage: `url(${thumb})`, filter: 'blur(14px)', transform: 'scale(1.06)' }} />}
      {full && <div className="desk-backdrop-image" style={{ ...style, backgroundImage: `url(${full})` }} />}
    </>
  );
}

function FrameView({ frame, fallback, onTone }: { frame: Frame; fallback: PresetId; onTone: (tone: Tone) => void }) {
  switch (frame.kind) {
    case 'preset':
      return <PresetLayer id={frame.id} />;
    case 'color':
      return <div className="bg-preset" style={{ background: frame.color }} />;
    case 'gradient':
      return <div className="bg-preset" style={{ background: `linear-gradient(${frame.angle}deg, ${frame.stops.join(', ')})` }} />;
    case 'image':
      return <ImageFrame frame={frame} fallback={fallback} onTone={onTone} />;
  }
}

export function Backdrop({
  background,
  dim,
  blur,
  motion,
  onTone,
  fixed = true,
}: {
  background: Background;
  dim: number;
  blur: number;
  motion: 'auto' | 'full' | 'reduced';
  onTone?: (tone: Tone) => void;
  /** Phủ cửa sổ (mặt bàn) hay chỉ phủ khung chứa (ảnh xem trước). */
  fixed?: boolean;
}) {
  const frame = useFrame(background);
  const fallback = useDaylight(true);
  const key = frameKey(frame);
  const [layers, setLayers] = useState<{ key: string; frame: Frame; leaving: boolean }[]>([{ key, frame, leaving: false }]);
  const [photoTone, setPhotoTone] = useState<Tone | null>(null);
  const toneRef = useRef(onTone);
  toneRef.current = onTone;

  useEffect(() => {
    setLayers(current => {
      if (current.at(-1)?.key === key) return current;
      return [...current.map(layer => ({ ...layer, leaving: true })), { key, frame, leaving: false }];
    });
    const timer = window.setTimeout(() => setLayers(current => current.filter(layer => !layer.leaving)), 1300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => setPhotoTone(null), [key]);

  const baseTone = useMemo<Tone>(() => (frame.kind === 'image' ? photoTone ?? 'dark' : toneOfBackground(frame, presetTone)), [frame, photoTone]);
  const tone: Tone = dim >= 45 ? 'dark' : baseTone;

  useEffect(() => {
    toneRef.current?.(tone);
  }, [tone]);

  const motionClass = motion === 'reduced' ? 'motion-off' : motion === 'auto' ? 'motion-auto' : 'motion-full';
  return (
    <div className={`desk-backdrop ${motionClass}`} style={fixed ? undefined : { position: 'absolute' }} aria-hidden>
      {layers.map(layer => (
        <div
          key={layer.key}
          className={`desk-backdrop-layer${blur ? ' blurred' : ''}${layer.leaving ? ' leaving' : ''}`}
          style={blur ? { filter: `blur(${blur}px)` } : undefined}
        >
          <FrameView frame={layer.frame} fallback={fallback} onTone={setPhotoTone} />
        </div>
      ))}
      {dim > 0 && <div className="desk-backdrop-dim" style={{ opacity: (dim / 100) * 0.85 }} />}
    </div>
  );
}
