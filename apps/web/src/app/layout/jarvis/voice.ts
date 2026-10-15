// Giọng nói của Jarvis: nhận dạng (Web Speech API của trình duyệt), bắt từ gọi "Jarvis", đọc câu trả lời, tiếng chuông.
// Nhận dạng do trình duyệt thực hiện (Chrome/Edge chuyển âm thanh tới dịch vụ nhận dạng của hãng) và chỉ chạy trên
// HTTPS hoặc localhost. Lệnh có ghi dữ liệu không bao giờ được xác nhận bằng giọng nói.

type RecognitionResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;

export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export const voiceSupport = {
  /** Trình duyệt có nhận dạng giọng nói. */
  recognition: Boolean(recognitionClass()),
  /** Micro chỉ dùng được trên HTTPS hoặc localhost. */
  secure: typeof window !== 'undefined' && window.isSecureContext,
  speech: typeof window !== 'undefined' && 'speechSynthesis' in window,
};

export function createRecognition(continuous: boolean): Recognition | null {
  const Recognition = recognitionClass();
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = 'vi-VN';
  recognition.continuous = continuous;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  return recognition;
}

export function transcriptOf(results: RecognitionResultList, from = 0) {
  let finalText = '';
  let interimText = '';
  for (let index = from; index < results.length; index += 1) {
    const text = results[index][0].transcript;
    if (results[index].isFinal) finalText += text;
    else interimText += text;
  }
  return { finalText: finalText.trim(), interimText: interimText.trim() };
}

export function recognitionError(code: string) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return voiceSupport.secure ? 'Trình duyệt chưa cho phép dùng micro' : 'Micro chỉ dùng được trên kết nối HTTPS';
    case 'audio-capture':
      return 'Không tìm thấy micro';
    case 'network':
      return 'Nhận dạng giọng nói cần kết nối mạng';
    case 'language-not-supported':
      return 'Trình duyệt chưa hỗ trợ nhận dạng tiếng Việt';
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Từ gọi "Jarvis"

function fold(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

// Người Việt nói "Jarvis" thường được nhận thành: jarvis, javis, gia vít, da vít, giác vít, cha vít…
// Bắt buộc đuôi s/t/ch để không nhầm với "gia vị".
const WAKE_SINGLE = /^(jarvis|javis|jarvit|javit|giavis|giavit|giarvis|davis|davit|chavis|chavit|zavis|zavit|jarvich|giavich)$/;
const WAKE_HEAD = /^(jar|ja|gia|giac|da|dac|cha|za|jav|jaa)$/;
const WAKE_TAIL = /^(vis|vit|vich|viz|vyt|vys)$/;

/** Bỏ dấu câu và từ gọi đệm ("ơi", "à", "này", "nè") ở đầu câu lệnh. */
function commandAfter(words: string[]) {
  return words
    .join(' ')
    .replace(/^[,.!?:;\s]+/, '')
    .replace(/^(ơi|à|này|nè)(?=[\s,.!?]|$)[,.!?\s]*/i, '')
    .trim();
}

/** Tìm từ gọi trong câu: trả về phần câu lệnh phía sau, hoặc null nếu không có từ gọi. */
export function afterWakeWord(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  const folded = words.map(word => fold(word).replace(/[^a-z]/g, ''));
  for (let index = 0; index < folded.length; index += 1) {
    if (WAKE_SINGLE.test(folded[index])) return commandAfter(words.slice(index + 1));
    if (index + 1 < folded.length && WAKE_HEAD.test(folded[index]) && WAKE_TAIL.test(folded[index + 1])) return commandAfter(words.slice(index + 2));
  }
  return null;
}

// ---------------------------------------------------------------- Giọng đọc

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function vietnameseVoice() {
  if (!voiceSupport.speech) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().replace('_', '-').startsWith('vi'));
  // Ưu tiên giọng tự nhiên (Edge: Microsoft HoaiMy/NamMinh Online), rồi giọng của Google.
  cachedVoice = voices.find(voice => /natural|online/i.test(voice.name)) ?? voices.find(voice => /google/i.test(voice.name)) ?? voices[0] ?? null;
  return cachedVoice;
}

if (voiceSupport.speech) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = undefined;
  };
}

export function canSpeakVietnamese() {
  return Boolean(vietnameseVoice());
}

/** Đọc câu trả lời; promise xong khi đọc hết hoặc bị dừng. */
export function speak(text: string): Promise<void> {
  return new Promise(resolve => {
    const voice = vietnameseVoice();
    if (!voice || !text.trim()) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' ').trim());
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (voiceSupport.speech) window.speechSynthesis.cancel();
}

// ---------------------------------------------------------------- Tiếng chuông khi nghe thấy tên

let audio: AudioContext | null = null;

export function chime() {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const oscillator = audio!.createOscillator();
      const gain = audio!.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * 0.09);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.28);
      oscillator.connect(gain).connect(audio!.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.3);
    });
  } catch {
    /* không có âm thanh vẫn dùng được */
  }
}
