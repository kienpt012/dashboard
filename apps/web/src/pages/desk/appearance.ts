import type { CSSProperties } from 'react';
import type { DeskAppearance } from './types';

// Biến CSS của bàn làm việc theo cài đặt giao diện: màu thẻ (kính mờ, nền đặc, chỉ viền), độ mờ, bo góc, màu nhấn,
// cỡ chữ, mật độ. Thẻ kính theo chế độ sáng/tối của giao diện để chữ luôn đọc rõ trên mọi hình nền.

export function deskStyle(appearance: DeskAppearance, dark: boolean): CSSProperties {
  const alpha = appearance.surfaceOpacity / 100;
  const surface =
    appearance.surface === 'outline'
      ? dark ? 'rgba(12, 16, 24, 0.18)' : 'rgba(255, 255, 255, 0.16)'
      : appearance.surface === 'solid'
        ? 'var(--ioc-color-bg-container)'
        : dark ? `rgba(17, 22, 32, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
  return {
    '--desk-surface': surface,
    '--desk-surface-strong': dark ? 'rgba(17, 22, 32, 0.92)' : 'rgba(255, 255, 255, 0.94)',
    '--desk-border': appearance.surface === 'outline'
      ? dark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.75)'
      : dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.6)',
    '--desk-blur': appearance.surface === 'glass' ? '18px' : appearance.surface === 'outline' ? '6px' : '0px',
    '--desk-radius': `${appearance.radius}px`,
    '--desk-accent': appearance.accent ?? 'var(--ioc-color-primary)',
    '--desk-font-scale': String(appearance.fontScale / 100),
    '--desk-pad': appearance.density === 'compact' ? '10px' : '14px',
    '--desk-gap': appearance.density === 'compact' ? '10px' : '14px',
  } as CSSProperties;
}
