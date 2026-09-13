import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyTheme, readTheme, watchSystemTheme, writeTheme, type ThemeChoice } from '../theme';

const order: ThemeChoice[] = ['light', 'dark', 'system'];

const labels: Record<ThemeChoice, string> = {
  light: 'Giao diện sáng',
  dark: 'Giao diện tối',
  system: 'Theo hệ thống',
};

const icons: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Nút xoay vòng ba chế độ hiển thị: sáng → tối → theo hệ thống. */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme());

  useEffect(() => {
    applyTheme(choice);
    // Khi để "theo hệ thống", màu thanh trạng thái phải đổi theo hệ điều hành.
    if (choice !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [choice]);

  const next = order[(order.indexOf(choice) + 1) % order.length];
  const Icon = icons[choice];

  return (
    <button
      type="button"
      className="top-icon-btn"
      onClick={() => {
        setChoice(next);
        writeTheme(next);
      }}
      aria-label={`${labels[choice]}. Chuyển sang ${labels[next].toLowerCase()}`}
      data-tooltip={labels[choice]}
    >
      <Icon />
    </button>
  );
}
