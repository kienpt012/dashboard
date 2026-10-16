import { useSyncExternalStore } from 'react';

// Cài đặt Jarvis của người dùng trên máy này: gọi bằng tên, đọc câu trả lời.
// Dùng chung giữa nút trên thanh đầu trang và khung Jarvis.

export type JarvisSettings = { wake: boolean; readAloud: boolean };

const KEY = 'ioc_jarvis';
const listeners = new Set<() => void>();

function read(): JarvisSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<JarvisSettings> | null;
    // Gọi bằng tên bật sẵn như trợ lý giọng nói của điện thoại; người dùng tắt được trong khung Jarvis.
    return { wake: saved?.wake !== false, readAloud: saved?.readAloud !== false };
  } catch {
    return { wake: true, readAloud: true };
  }
}

let current = read();

export function getJarvisSettings() {
  return current;
}

export function setJarvisSettings(patch: Partial<JarvisSettings> | ((value: JarvisSettings) => Partial<JarvisSettings>)) {
  const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
  if (next.wake === current.wake && next.readAloud === current.readAloud) return;
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* chế độ riêng tư: chỉ nhớ trong phiên */
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useJarvisSettings() {
  return useSyncExternalStore(subscribe, getJarvisSettings, getJarvisSettings);
}
