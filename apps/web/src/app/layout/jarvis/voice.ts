// Giọng nói của Jarvis: nhận dạng (Web Speech API của trình duyệt), bắt tên gọi "Jarvis", đọc câu trả lời,
// đo âm lượng micro cho hiệu ứng, tiếng chuông. Nhận dạng do trình duyệt thực hiện (Chrome/Edge chuyển âm thanh tới
// dịch vụ nhận dạng của hãng) và chỉ chạy trên HTTPS hoặc localhost. Lệnh có ghi dữ liệu không bao giờ được xác nhận
// bằng giọng nói.

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

/**
 * Tên "Jarvis" là tiếng Anh: bộ nhận dạng tiếng Việt thường nghe thành câu tiếng Việt ("Hãy cho biết"), nên phiên chờ
 * tên gọi dùng tiếng Anh; câu lệnh sau đó nghe bằng tiếng Việt.
 */
export const WAKE_LANG = 'en-US';
export const COMMAND_LANG = 'vi-VN';

export function createRecognition(continuous: boolean, lang = COMMAND_LANG): Recognition | null {
  const Recognition = recognitionClass();
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.continuous = continuous;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
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

/** Mọi phương án nhận dạng (kể cả phương án phụ) — tên gọi có thể nằm ở phương án thứ hai, thứ ba. */
export function alternativesOf(results: RecognitionResultList, from = 0): string[] {
  const texts: string[] = [];
  for (let index = from; index < results.length; index += 1) {
    const result = results[index] as unknown as ArrayLike<{ transcript: string }>;
    for (let alt = 0; alt < result.length; alt += 1) {
      if (result[alt]?.transcript) texts.push(result[alt].transcript);
    }
  }
  return texts;
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
      return 'Trình duyệt chưa hỗ trợ nhận dạng ngôn ngữ này';
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

// Bộ nhận dạng tiếng Anh nghe giọng Việt nói "Jarvis" thành: jarvis, javis, jervis, jarvas, charvis…
// Không nhận các tên tiếng Anh có thật (Davis, Travis) để tránh tự kích hoạt khi trong phòng nói chuyện khác.
const WAKE_EN = /\b(jarvis+|jervis|jarves|jarvas|jarvus|javis|jaavis|charvis|garvis|harvis|jarvish)\b/i;

// Bộ nhận dạng tiếng Việt viết "Jarvis" theo nhiều cách: jarvis, javis, gia vít, giá vít, da vít, giác vít, chà vích,
// dạ vịt… Khớp theo âm trên chuỗi đã bỏ dấu, ghép 1–3 từ liền nhau: phụ âm đầu (gi/d/r/ch/tr/z/j), vần "a",
// rồi "v", nguyên âm i/y và BẮT BUỘC phụ âm cuối (s/t/ch/x/z/c) — nhờ vậy "gia vị", "giá vé" không bị nhận nhầm.
const WAKE = /^(gi|dz|d|r|ch|tr|z|j|y)(a|ar|ac|aa|ah)(v)(i|y|ee)(s|t|ch|x|z|c|th|ts)$/;

/** Từ đệm ở đầu câu lệnh sau tên gọi. */
const LEAD = /^(ơi|oi|à|a|này|nay|nè|ne|ạ)(?=[\s,.!?]|$)[,.!?\s]*/i;

function letters(word: string) {
  return fold(word).replace(/[^a-z]/g, '');
}

/** Vị trí tên gọi trong câu: [từ bắt đầu, số từ], hoặc null. */
export function findWakeWord(words: string[]): [number, number] | null {
  const keys = words.map(letters);
  for (let start = 0; start < keys.length; start += 1) {
    if (!keys[start]) continue;
    let joined = '';
    for (let size = 1; size <= 3 && start + size <= keys.length; size += 1) {
      joined += keys[start + size - 1];
      if (WAKE.test(joined)) return [start, size];
    }
  }
  return null;
}

/** Bỏ dấu câu và từ gọi đệm ("ơi", "à", "này", "nè") ở đầu câu lệnh. */
function commandAfter(words: string[]) {
  return words.join(' ').replace(/^[,.!?:;\s]+/, '').replace(LEAD, '').trim();
}

/** Tìm từ gọi trong câu tiếng Việt: trả về phần câu lệnh phía sau, hoặc null nếu không có từ gọi. */
export function afterWakeWord(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  const found = findWakeWord(words);
  return found ? commandAfter(words.slice(found[0] + found[1])) : null;
}

/** Câu do bộ nhận dạng tiếng Anh (phiên chờ tên gọi) nghe được có chứa tên Jarvis không. */
export function heardWakeWord(text: string): boolean {
  return WAKE_EN.test(text);
}

// ---------------------------------------------------------------- Giọng đọc

export function vietnameseVoices(): SpeechSynthesisVoice[] {
  if (!voiceSupport.speech) return [];
  return window.speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().replace('_', '-').startsWith('vi'));
}

/** Giọng mặc định cho Jarvis: giọng nam tự nhiên (Edge: Microsoft NamMinh Online), rồi giọng tự nhiên khác, giọng Google. */
export function defaultVoice(voices = vietnameseVoices()): SpeechSynthesisVoice | null {
  return (
    voices.find(voice => /namminh/i.test(voice.name)) ??
    voices.find(voice => /natural|online/i.test(voice.name)) ??
    voices.find(voice => /google/i.test(voice.name)) ??
    voices[0] ??
    null
  );
}

let preferredName: string | null = null;

/** Chọn giọng theo tên (lưu trong cài đặt Jarvis); không có thì dùng giọng mặc định. */
export function setPreferredVoice(name: string | null | undefined) {
  preferredName = name || null;
}

function currentVoice() {
  const voices = vietnameseVoices();
  return (preferredName && voices.find(voice => voice.name === preferredName)) || defaultVoice(voices);
}

if (voiceSupport.speech) {
  // Chrome nạp danh sách giọng không đồng bộ; gọi một lần để kích hoạt việc nạp.
  window.speechSynthesis.getVoices();
}

export function canSpeakVietnamese() {
  return Boolean(currentVoice());
}

/** Tách câu dài: Chrome tự ngắt giọng đọc sau khoảng 15 giây nếu một lượt đọc quá dài. */
function chunks(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?;:…]+[.!?;:…]*\s*/g) ?? [clean];
  const parts: string[] = [];
  for (const sentence of sentences) {
    const last = parts[parts.length - 1];
    if (last && last.length + sentence.length < 180) parts[parts.length - 1] = last + sentence;
    else parts.push(sentence);
  }
  return parts.map(part => part.trim()).filter(Boolean);
}

let speechToken = 0;

/**
 * Đọc thành tiếng; promise xong khi đọc hết hoặc bị dừng. onWord được gọi ở mỗi ranh giới từ (dùng cho hiệu ứng nhấp
 * nháy theo lời nói; trình duyệt không báo ranh giới từ thì gọi giả lập theo nhịp đọc); onChunk báo đoạn đang đọc
 * (dùng làm phụ đề).
 */
export function speak(text: string, options: { onWord?: () => void; onChunk?: (part: string) => void; rate?: number } = {}): Promise<void> {
  const voice = currentVoice();
  const parts = chunks(text);
  if (!voice || parts.length === 0) return Promise.resolve();
  window.speechSynthesis.cancel();
  const token = ++speechToken;
  return new Promise(resolve => {
    let index = 0;
    let ticker = 0;
    let boundaries = false;
    const done = () => {
      window.clearInterval(ticker);
      resolve();
    };
    const next = () => {
      if (token !== speechToken || index >= parts.length) {
        done();
        return;
      }
      const part = parts[index++];
      options.onChunk?.(part);
      // Trình duyệt có thể từ chối giọng hoặc dịch vụ đọc lỗi: bỏ qua đoạn đó, không để cuộc nói chuyện bị kẹt.
      try {
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = options.rate ?? 1.02;
        utterance.pitch = /namminh/i.test(voice.name) ? 0.95 : 1;
        utterance.onboundary = event => {
          if (event.name === 'word' || !event.name) {
            boundaries = true;
            options.onWord?.();
          }
        };
        utterance.onend = () => next();
        utterance.onerror = () => next();
        window.speechSynthesis.speak(utterance);
      } catch {
        next();
      }
    };
    if (options.onWord) {
      ticker = window.setInterval(() => {
        if (!boundaries && window.speechSynthesis.speaking) options.onWord?.();
      }, 230);
    }
    next();
  });
}

export function stopSpeaking() {
  speechToken += 1;
  if (voiceSupport.speech) window.speechSynthesis.cancel();
}

// ---------------------------------------------------------------- Âm lượng micro (cho hiệu ứng)

export type MicLevel = { level: () => number; close: () => void };

/** Mở micro để đo âm lượng 0..1; không có quyền micro thì trả về null (hiệu ứng dùng nhịp giả lập). */
export async function openMicLevel(): Promise<MicLevel | null> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let smooth = 0;
    return {
      level: () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) sum += ((value - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        smooth = smooth * 0.7 + Math.min(1, rms * 4.5) * 0.3;
        return smooth;
      },
      close: () => {
        stream.getTracks().forEach(track => track.stop());
        void context.close();
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Tiếng chuông khi nghe thấy tên

let audio: AudioContext | null = null;

export function chime() {
  try {
    audio ??= new AudioContext();
    // Lần đầu tạo khi chưa có thao tác của người dùng thì AudioContext bị treo; thử mở lại mỗi lần kêu.
    if (audio.state === 'suspended') void audio.resume();
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
