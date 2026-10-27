import type { CopilotResponse } from '@/types/core';

// Gửi câu hỏi sang khung Jarvis từ nơi khác trong ứng dụng (widget Hỏi Jarvis): khung quản trị nghe sự kiện này.

export const JARVIS_ASK_EVENT = 'ioc:jarvis-ask';

export type JarvisAsk = { question: string; answer?: CopilotResponse };

export function askJarvis(question: string, answer?: CopilotResponse) {
  window.dispatchEvent(new CustomEvent<JarvisAsk>(JARVIS_ASK_EVENT, { detail: { question, answer } }));
}
