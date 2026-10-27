// Nền "theo giờ trong ngày": bốn chặng theo giờ máy của người xem.

export type DaylightPhase = 'dawn' | 'day' | 'dusk' | 'night';

const PHASES: { id: DaylightPhase; from: number }[] = [
  { id: 'night', from: 0 },
  { id: 'dawn', from: 5 },
  { id: 'day', from: 8 },
  { id: 'dusk', from: 17 },
  { id: 'night', from: 19 },
];

/** Chặng hiện tại và thời điểm chuyển sang chặng kế tiếp. */
export function daylightPhase(now: Date): { id: DaylightPhase; next: Date } {
  const hour = now.getHours();
  let index = 0;
  for (let i = 0; i < PHASES.length; i += 1) if (hour >= PHASES[i].from) index = i;
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  if (index === PHASES.length - 1) {
    next.setDate(next.getDate() + 1);
    next.setHours(PHASES[1].from);
  } else {
    next.setHours(PHASES[index + 1].from);
  }
  return { id: PHASES[index].id, next };
}
