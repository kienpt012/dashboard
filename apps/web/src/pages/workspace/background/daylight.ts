import type { ExtraWallpaperId } from './catalog';

/** Local device time, adapted from the desk daylight feature in branch 0b86aa8. */
export function resolveDaylightPreset(now: Date): ExtraWallpaperId | 'dusk' {
  const hour = now.getHours();
  if (hour >= 5 && hour < 8) return 'binh-minh';
  if (hour >= 8 && hour < 17) return 'gom';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'dem-sao';
}
