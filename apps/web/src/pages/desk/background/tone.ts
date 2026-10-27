import type { Background, PresetId } from '../types';

// Tông sáng/tối của hình nền, để chọn màu chữ đặt thẳng trên nền (lời chào) cho đủ tương phản.

export type Tone = 'light' | 'dark';

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Độ sáng tương đối theo WCAG 2.x (0: đen, 1: trắng). */
export function relativeLuminance(hex: string): number {
  const value = parseInt(hex.replace('#', ''), 16);
  const r = channel((value >> 16) & 255);
  const g = channel((value >> 8) & 255);
  const b = channel(value & 255);
  return Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 10_000) / 10_000;
}

/** Nền sáng khi chữ đen tương phản hơn chữ trắng (ngưỡng độ sáng ≈ 0,179). */
export const toneOfLuminance = (luminance: number): Tone => ((luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? 'light' : 'dark');

export const toneOfHex = (hex: string): Tone => toneOfLuminance(relativeLuminance(hex));

export function toneOfBackground(background: Background, presetTone: (id: PresetId) => Tone): Tone {
  switch (background.kind) {
    case 'color':
      return toneOfHex(background.color);
    case 'gradient':
      return toneOfLuminance(background.stops.reduce((sum, stop) => sum + relativeLuminance(stop), 0) / background.stops.length);
    case 'preset':
      return presetTone(background.id);
    default:
      return 'dark';
  }
}
