import { AudioOutlined, ClearOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Flex, Input, Popover, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { useLocality } from '@/app/locality';
import { errorText, http } from '@/lib/api';
import { dateTime, num, pct } from '@/lib/format';
import type { CopilotResponse } from '@/types/core';
import { setJarvisSettings, useJarvisSettings } from './jarvis/settings';
import { JarvisHud, prefersReducedMotion, type HudPhase, type HudSignal } from './jarvis/Hud';
import {
  afterWakeWord,
  alternativesOf,
  canSpeakVietnamese,
  chime,
  COMMAND_LANG,
  createRecognition,
  defaultVoice,
  heardWakeWord,
  openMicLevel,
  recognitionError,
  setPreferredVoice,
  speak,
  stopSpeaking,
  transcriptOf,
  vietnameseVoices,
  voiceSupport,
  WAKE_LANG,
  type Recognition,
} from './jarvis/voice';

// Jarvis — trợ lý điều hành: hỏi bằng chữ hoặc giọng nói, gọi bằng tên "Jarvis", đọc câu trả lời.
// Lệnh có ghi dữ liệu luôn chờ người dùng bấm xác nhận; không xác nhận bằng giọng nói.

const SUGGESTIONS = ['Tình hình thực hiện năm nay', 'Chỉ tiêu nào sắp trễ hạn?', 'Chỉ tiêu nào chưa có số liệu?', 'Đề xuất nào đang chờ xác minh?'];

export type JarvisVoiceState = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking';

type Bubble =
  | { id: number; role: 'user'; text: string; voice?: boolean }
  | { id: number; role: 'assistant'; answer?: CopilotResponse; error?: string; action?: 'pending' | 'busy' | 'done' | 'cancelled' };

/** Biểu tượng Jarvis: lò phản ứng nhỏ cùng phong cách vòng HUD; quay nhanh khi đang nghe. */
export function JarvisMark({ size = 20, state = 'off' }: { size?: number; state?: JarvisVoiceState }) {
  return (
    <span className={`jarvis-mark ${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 40 40">
        <circle className="jm-outer" cx="20" cy="20" r="18" />
        <path className="jm-arc" d="M20 4 A16 16 0 0 1 36 20" />
        <path className="jm-arc b" d="M20 36 A16 16 0 0 1 4 20" />
        <circle className="jm-ring" cx="20" cy="20" r="10.5" />
        <circle className="jm-core" cx="20" cy="20" r="5" />
      </svg>
    </span>
  );
}

function Rows({ answer }: { answer: CopilotResponse }) {
  if (!answer.rowType || !answer.rows?.length) return null;
  const common = { size: 'small' as const, pagination: false as const, scroll: { x: true as const }, style: { marginTop: 8 } };
  switch (answer.rowType) {
    case 'targets':
      return (
        <Table
          {...common}
          rowKey="code"
          dataSource={answer.rows}
          columns={[
            {
              title: 'Chỉ tiêu',
              dataIndex: 'title',
              render: (value, row) => (
                <>
                  <Typography.Text type="secondary">{row.code}</Typography.Text> {row.id ? <Link to={`/admin/targets/${row.id}`}>{value}</Link> : value}
                </>
              ),
            },
            { title: 'Phòng', dataIndex: 'department', width: 120 },
            answer.rows.some(row => row.missing)
              ? { title: 'Thiếu kỳ', dataIndex: 'missing', width: 130 }
              : { title: 'Tiến độ', dataIndex: 'progress', width: 80, align: 'right' as const, render: value => pct(value) },
          ]}
        />
      );
    case 'documents':
      return (
        <Table
          {...common}
          rowKey="id"
          dataSource={answer.rows}
          columns={[
            { title: 'Văn bản', dataIndex: 'title', render: (value, row) => <Link to={`/admin/documents/${row.id}`}>{value}</Link> },
            { title: 'Đề xuất', dataIndex: 'candidates', width: 70, align: 'right' },
          ]}
        />
      );
    case 'candidates':
      return (
        <Table
          {...common}
          rowKey={(_, index) => String(index)}
          dataSource={answer.rows}
          columns={[
            { title: 'Đề xuất', dataIndex: 'name' },
            { title: 'Văn bản', dataIndex: 'documentCode', width: 110, render: (value, row) => <Link to={`/admin/documents/${row.documentId}`}>{value}</Link> },
            { title: 'Cách đọc', dataIndex: 'method', width: 80, render: value => (value === 'LLM' ? 'AI' : 'Quy tắc') },
            { title: 'Tin cậy', dataIndex: 'confidence', width: 70, align: 'right', render: value => pct(value * 100) },
          ]}
        />
      );
    case 'preview':
      return (
        <Table
          {...common}
          rowKey={(_, index) => String(index)}
          dataSource={answer.rows}
          columns={[
            { title: 'Chỉ tiêu', dataIndex: 'name' },
            { title: 'Mục tiêu', dataIndex: 'value', width: 100, render: (value, row) => `${num(value)} ${row.unit ?? ''}` },
            { title: 'Phòng', dataIndex: 'department', width: 120 },
            { title: 'Tin cậy', dataIndex: 'confidence', width: 70, align: 'right', render: value => pct(value * 100) },
          ]}
        />
      );
    case 'results':
      return (
        <Table
          {...common}
          rowKey={(_, index) => String(index)}
          dataSource={answer.rows}
          columns={[
            { title: 'Chỉ tiêu', dataIndex: 'name' },
            { title: 'Kết quả', dataIndex: 'ok', width: 120, render: (ok, row) => (ok ? <Tag color="green">{row.code}</Tag> : <Tag color="red">{row.error}</Tag>) },
          ]}
        />
      );
    default:
      return null;
  }
}

const STATUS_TEXT: Record<JarvisVoiceState, string | null> = {
  off: null,
  idle: 'Đang chờ gọi “Jarvis”',
  listening: 'Đang nghe',
  thinking: 'Đang xử lý',
  speaking: 'Đang nói',
};

/** Thời gian chờ câu lệnh sau khi Jarvis chào xong. */
const COMMAND_TIMEOUT_MS = 9000;
const GREETED_KEY = 'ioc_jarvis_greeted';
const SHORT_GREETINGS = ['Tôi nghe đây.', 'Vâng, bạn cần gì?', 'Jarvis đây, mời bạn nói.'];

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export type JarvisHandle = {
  /** Gọi Jarvis: mở khung, hiệu ứng HUD, lời chào; gọi bằng giọng nói thì nghe tiếp câu lệnh. */
  summon: (byVoice: boolean) => void;
};

export function Jarvis({
  open,
  onOpen,
  onClose,
  onVoiceState,
  introEnabled,
  ref,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onVoiceState?: (state: JarvisVoiceState) => void;
  /** Cấu hình hệ thống: hiệu ứng toàn màn hình khi gọi Jarvis. */
  introEnabled: boolean;
  ref?: Ref<JarvisHandle>;
}) {
  const { message } = App.useApp();
  const locality = useLocality();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const settings = useJarvisSettings();
  const [voice, setVoice] = useState<JarvisVoiceState>('off');
  const [heard, setHeard] = useState('');
  /** Câu micro nghe được gần nhất khi chờ tên gọi — hiện trong cài đặt để kiểm tra vì sao chưa gọi được. */
  const [lastHeard, setLastHeard] = useState('');
  const [hud, setHud] = useState<{ phase: HudPhase; caption: string } | null>(null);
  const [hudLeaving, setHudLeaving] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => vietnameseVoices());
  const signal = useRef<HudSignal>({ level: 0, pulse: 0 });
  const counter = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const recognition = useRef<Recognition | null>(null);
  /** Kiểu phiên nghe đang chạy: chờ tên gọi (tiếng Anh, liên tục), câu lệnh sau tên gọi, hay bấm để nói. */
  const listenMode = useRef<'wake' | 'command' | 'talk' | null>(null);
  const voiceRef = useRef(voice);
  const settingsRef = useRef(settings);
  const busyRef = useRef(false);
  /** Micro bị chặn hoặc lỗi: không tự mở lại cho đến khi người dùng bật lại. */
  const blockedRef = useRef(false);
  /** Người dùng vừa tự bật gọi tên (để biết có nên báo lỗi micro hay không). */
  const askedRef = useRef(false);
  /** Mỗi lần gọi là một phiên; phiên mới huỷ các bước còn dở của phiên cũ. */
  const sessionRef = useRef(0);
  const lastSummonRef = useRef(0);
  /** HUD bị người dùng thu nhỏ trong phiên này. */
  const hudHiddenRef = useRef(false);
  const micRef = useRef<{ close: () => void; frame: number } | null>(null);
  const restartTimer = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);
  const onOpenRef = useRef(onOpen);
  const introRef = useRef(introEnabled);
  const canListen = voiceSupport.recognition;

  settingsRef.current = settings;
  onOpenRef.current = onOpen;
  introRef.current = introEnabled;

  useEffect(() => setPreferredVoice(settings.voiceName), [settings.voiceName]);

  // Chrome nạp danh sách giọng đọc sau khi trang mở.
  useEffect(() => {
    if (!voiceSupport.speech) return;
    const load = () => setVoices(vietnameseVoices());
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const updateVoice = useCallback(
    (next: JarvisVoiceState) => {
      voiceRef.current = next;
      setVoice(next);
      onVoiceState?.(next);
    },
    [onVoiceState],
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [bubbles, heard]);

  const send = useCallback(async (value: string, viaVoice = false) => {
    const content = value.trim();
    if (!content || busyRef.current) return null;
    busyRef.current = true;
    const userId = ++counter.current;
    const replyId = ++counter.current;
    setBubbles(list => [...list, { id: userId, role: 'user', text: content, voice: viaVoice }]);
    setText('');
    setSending(true);
    try {
      const answer = await http.post<CopilotResponse>('/copilot/messages', { message: content });
      setBubbles(list => [...list, { id: replyId, role: 'assistant', answer, action: answer.pendingAction ? 'pending' : undefined }]);
      return answer;
    } catch (error) {
      setBubbles(list => [...list, { id: replyId, role: 'assistant', error: errorText(error) }]);
      return null;
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  }, []);

  // ---------------------------------------------------------------- HUD

  const showHud = useCallback((phase: HudPhase, caption: string) => {
    if (hudHiddenRef.current) return;
    setHudLeaving(false);
    setHud({ phase, caption });
  }, []);

  const closeHud = useCallback(() => {
    setHudLeaving(true);
    window.setTimeout(() => {
      setHud(null);
      setHudLeaving(false);
    }, 380);
  }, []);

  const pulse = useCallback(() => {
    signal.current.pulse = Math.min(1, signal.current.pulse + 0.55);
  }, []);

  const stopMic = useCallback(() => {
    if (!micRef.current) return;
    cancelAnimationFrame(micRef.current.frame);
    micRef.current.close();
    micRef.current = null;
    signal.current.level = 0;
  }, []);

  /** Đo âm lượng micro cho vòng sáng HUD trong lúc nghe câu lệnh. */
  const startMic = useCallback(async (session: number) => {
    stopMic();
    const mic = await openMicLevel();
    if (!mic) return;
    if (session !== sessionRef.current || listenMode.current !== 'command' || micRef.current) {
      mic.close();
      return;
    }
    const holder = { close: mic.close, frame: 0 };
    const tick = () => {
      signal.current.level = mic.level();
      holder.frame = requestAnimationFrame(tick);
    };
    holder.frame = requestAnimationFrame(tick);
    micRef.current = holder;
  }, [stopMic]);

  // ---------------------------------------------------------------- Nghe

  const stopListening = useCallback(() => {
    const current = recognition.current;
    recognition.current = null;
    listenMode.current = null;
    if (current) {
      current.onend = null;
      current.onresult = null;
      current.onerror = null;
      try {
        current.abort();
      } catch {
        /* đã dừng */
      }
    }
  }, []);

  /** Lỗi micro: ngừng tự mở lại; chỉ báo khi người dùng vừa tự bật (lúc tự bật khi mở trang thì im lặng). */
  const onRecognitionError = useCallback(
    (code: string) => {
      const text = recognitionError(code);
      if (!text) return false;
      blockedRef.current = true;
      if (askedRef.current || listenMode.current === 'talk' || listenMode.current === 'command') message.error(text);
      askedRef.current = false;
      return true;
    },
    [message],
  );

  // Các hàm dưới gọi lẫn nhau theo vòng (chờ tên → gọi → nghe lệnh → trả lời → chờ tên): dùng ref để luôn gọi bản mới nhất.
  const flow = useRef({ summon: (_byVoice: boolean) => {} });

  const startWake = useCallback(() => {
    if (!canListen || !settingsRef.current.wake || recognition.current || blockedRef.current || !voiceSupport.secure) return;
    if (document.visibilityState === 'hidden') return;
    const rec = createRecognition(true, WAKE_LANG);
    if (!rec) return;
    rec.onresult = event => {
      if (listenMode.current !== 'wake') return;
      const { finalText, interimText } = transcriptOf(event.results, event.resultIndex);
      const said = finalText || interimText;
      if (said) setLastHeard(said);
      const candidates = [said, ...alternativesOf(event.results, event.resultIndex)];
      if (candidates.some(candidate => heardWakeWord(candidate))) {
        stopListening();
        flow.current.summon(true);
      }
    };
    rec.onerror = event => {
      onRecognitionError(event.error);
    };
    rec.onend = () => {
      // Trình duyệt tự ngắt phiên nghe dài hoặc khi im lặng lâu; mở lại nếu vẫn đang bật chế độ gọi tên.
      if (recognition.current !== rec) return;
      recognition.current = null;
      listenMode.current = null;
      if (blockedRef.current) {
        updateVoice('off');
        return;
      }
      restartTimer.current = window.setTimeout(() => {
        if (mountedRef.current && settingsRef.current.wake && voiceRef.current === 'idle') startWake();
      }, 250);
    };
    recognition.current = rec;
    listenMode.current = 'wake';
    try {
      rec.start();
      if (voiceRef.current === 'off') updateVoice('idle');
    } catch {
      recognition.current = null;
      listenMode.current = null;
    }
  }, [canListen, onRecognitionError, stopListening, updateVoice]);

  /** Quay về chờ tên gọi (nếu bật) hoặc tắt. */
  const resume = useCallback(() => {
    stopMic();
    if (settingsRef.current.wake && !blockedRef.current) {
      updateVoice('idle');
      startWake();
    } else updateVoice('off');
  }, [startWake, stopMic, updateVoice]);

  /** Trả lời một câu lệnh nói: gửi, đọc câu trả lời kèm phụ đề trên HUD, rồi quay về chờ tên gọi. */
  const answerVoice = useCallback(
    async (command: string, session: number) => {
      stopMic();
      updateVoice('thinking');
      showHud('thinking', command);
      // Câu hỏi gõ tay đang chờ trả lời: đợi xong (tối đa 30 giây) rồi mới gửi câu lệnh nói.
      for (let waited = 0; busyRef.current && waited < 30_000; waited += 200) {
        await delay(200);
        if (session !== sessionRef.current) return;
      }
      const answer = await send(command, true);
      if (session !== sessionRef.current) return;
      const reply = answer?.reply ?? 'Xin lỗi, tôi chưa trả lời được câu này. Bạn xem chi tiết trong khung Jarvis.';
      updateVoice('speaking');
      showHud('speaking', reply);
      if (settingsRef.current.readAloud && canSpeakVietnamese()) {
        await speak(reply, { onWord: pulse, onChunk: part => showHud('speaking', part) });
      } else await delay(Math.min(6000, 1500 + reply.length * 35));
      if (session !== sessionRef.current) return;
      closeHud();
      resume();
    },
    [closeHud, pulse, resume, send, showHud, stopMic, updateVoice],
  );

  /** Nghe một câu lệnh tiếng Việt sau lời chào. */
  const listenCommand = useCallback(
    (session: number) => {
      const rec = createRecognition(false, COMMAND_LANG);
      if (!rec) {
        closeHud();
        resume();
        return;
      }
      let latest = '';
      let finished = false;
      // Im lặng quá lâu: kết thúc phiên nghe với những gì đã nghe được.
      const timer = window.setTimeout(() => done(latest), COMMAND_TIMEOUT_MS);
      const done = (command: string) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        // Phiên đã bị thay (gọi lại, bấm nói, rời trang): phiên mới đã tự dừng recognizer cũ — không đụng vào cái đang chạy.
        if (session !== sessionRef.current) return;
        if (recognition.current === rec) stopListening();
        const clean = (afterWakeWord(command) ?? command).trim();
        if (clean.length > 1) void answerVoice(clean, session);
        else {
          showHud('listening', 'Tôi chưa nghe rõ. Gọi “Jarvis” khi bạn cần nhé.');
          window.setTimeout(() => {
            if (session !== sessionRef.current) return;
            closeHud();
            resume();
          }, 1600);
        }
      };
      rec.onresult = event => {
        const { finalText, interimText } = transcriptOf(event.results, 0);
        latest = finalText || interimText;
        setHeard(latest);
        showHud('listening', latest);
        if (finalText) done(finalText);
      };
      rec.onerror = event => {
        onRecognitionError(event.error);
      };
      rec.onend = () => {
        if (recognition.current !== rec && recognition.current !== null) return;
        done(latest);
      };
      recognition.current = rec;
      listenMode.current = 'command';
      updateVoice('listening');
      setHeard('');
      showHud('listening', '');
      void startMic(session);
      try {
        rec.start();
      } catch {
        done('');
      }
    },
    [answerVoice, closeHud, onRecognitionError, resume, showHud, startMic, stopListening, updateVoice],
  );

  const summon = useCallback(
    async (byVoice: boolean) => {
      const session = ++sessionRef.current;
      stopListening();
      stopSpeaking();
      stopMic();
      onOpenRef.current();
      const withHud = introRef.current && !prefersReducedMotion();
      // Tắt hiệu ứng (cấu hình hoặc "giảm chuyển động"): mọi bước của phiên này đều không hiện HUD.
      hudHiddenRef.current = !withHud;
      // Phiên trước bị cắt ngang: đóng HUD cũ ngay, không để phụ đề cũ kẹt lại.
      setHud(null);
      setHudLeaving(false);
      const now = Date.now();
      // Bấm nút thì chỉ chào kèm hiệu ứng nếu chưa chào trong 1 phút; gọi bằng giọng nói thì luôn chào.
      const greet = byVoice || now - lastSummonRef.current > 60_000;
      lastSummonRef.current = now;
      if (!greet) {
        resume();
        return;
      }
      let first = false;
      try {
        first = !sessionStorage.getItem(GREETED_KEY);
        sessionStorage.setItem(GREETED_KEY, '1');
      } catch {
        /* bỏ qua */
      }
      const greeting = first
        ? `Xin chào, tôi là Jarvis, trợ lý điều hành của ${locality.agencyName || locality.name || locality.brandName}. Tôi có thể giúp gì cho bạn?`
        : SHORT_GREETINGS[Math.floor(Math.random() * SHORT_GREETINGS.length)];
      if (byVoice) chime();
      if (withHud) showHud('intro', greeting);
      updateVoice('speaking');
      if (settingsRef.current.readAloud && canSpeakVietnamese()) {
        await delay(withHud ? 450 : 0);
        if (session !== sessionRef.current) return;
        await speak(greeting, { onWord: pulse });
      } else await delay(withHud ? 1800 : 0);
      if (session !== sessionRef.current) return;
      if (byVoice) listenCommand(session);
      else {
        if (withHud) closeHud();
        resume();
      }
    },
    [closeHud, listenCommand, locality.agencyName, locality.brandName, locality.name, pulse, resume, showHud, stopListening, stopMic, updateVoice],
  );

  flow.current = { summon: byVoice => void summon(byVoice) };

  useImperativeHandle(ref, () => ({ summon: byVoice => void summon(byVoice) }), [summon]);

  /** Bấm để nói trong khung Jarvis: nghe một câu tiếng Việt rồi gửi. */
  function talk() {
    if (listenMode.current === 'talk') {
      stopListening();
      resume();
      return;
    }
    const session = ++sessionRef.current;
    stopListening();
    stopSpeaking();
    stopMic();
    setHud(null);
    setHudLeaving(false);
    const rec = createRecognition(false, COMMAND_LANG);
    if (!rec) return;
    let latest = '';
    rec.onresult = event => {
      const { finalText, interimText } = transcriptOf(event.results, 0);
      latest = finalText || interimText;
      setText(latest);
    };
    rec.onerror = event => {
      onRecognitionError(event.error);
    };
    rec.onend = () => {
      if (recognition.current !== rec) return;
      recognition.current = null;
      listenMode.current = null;
      if (latest.trim()) {
        hudHiddenRef.current = true;
        void answerVoice(latest, session);
      } else resume();
    };
    recognition.current = rec;
    listenMode.current = 'talk';
    updateVoice('listening');
    try {
      rec.start();
    } catch {
      recognition.current = null;
      resume();
    }
  }

  // Bật/tắt chế độ gọi tên.
  useEffect(() => {
    if (!canListen) return;
    if (settings.wake) {
      if (!recognition.current && voiceRef.current !== 'thinking' && voiceRef.current !== 'speaking') startWake();
    } else if (listenMode.current === 'wake') {
      stopListening();
      updateVoice('off');
    }
  }, [settings.wake, canListen, startWake, stopListening, updateVoice]);

  // Trình duyệt dừng micro khi chuyển tab: quay lại thì nghe tiếp.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && settingsRef.current.wake && !recognition.current && (voiceRef.current === 'idle' || voiceRef.current === 'off')) startWake();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [startWake]);

  // Dọn khi rời khung quản trị.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      window.clearTimeout(restartTimer.current);
      stopListening();
      stopSpeaking();
      stopMic();
    };
  }, [stopListening, stopMic]);

  async function decide(bubbleId: number, actionId: string, confirm: boolean) {
    setBubbles(list => list.map(item => (item.id === bubbleId ? { ...item, action: 'busy' as const } : item)));
    try {
      if (confirm) {
        const answer = await http.post<CopilotResponse>(`/copilot/actions/${actionId}/confirm`);
        setBubbles(list => [...list.map(item => (item.id === bubbleId ? { ...item, action: 'done' as const } : item)), { id: ++counter.current, role: 'assistant', answer }]);
      } else {
        await http.post(`/copilot/actions/${actionId}/cancel`);
        setBubbles(list => list.map(item => (item.id === bubbleId ? { ...item, action: 'cancelled' as const } : item)));
      }
    } catch (error) {
      message.error(errorText(error));
      setBubbles(list => list.map(item => (item.id === bubbleId ? { ...item, action: 'pending' as const } : item)));
    }
  }

  const settingsPanel = (
    <Flex vertical gap={12} style={{ width: 280 }}>
      <Flex justify="space-between" align="center" gap={12}>
        <span>Gọi bằng tên “Jarvis”</span>
        <Switch
          checked={settings.wake && !blockedRef.current}
          disabled={!canListen || !voiceSupport.secure}
          onChange={wake => {
            if (wake) {
              chime();
              blockedRef.current = false;
              askedRef.current = true;
              setJarvisSettings({ wake });
              startWake();
            } else {
              setJarvisSettings({ wake });
            }
          }}
        />
      </Flex>
      <Flex justify="space-between" align="center" gap={12}>
        <span>Đọc câu trả lời</span>
        <Switch checked={settings.readAloud} disabled={!voiceSupport.speech} onChange={readAloud => setJarvisSettings({ readAloud })} />
      </Flex>
      {voices.length > 0 && (
        <Flex vertical gap={4}>
          <span>Giọng đọc</span>
          <Select
            size="small"
            value={settings.voiceName ?? defaultVoice(voices)?.name}
            options={voices.map(item => ({ value: item.name, label: item.name.replace(/^Microsoft /, '').replace(/ - Vietnamese \(Vietnam\)$/, '') }))}
            onChange={voiceName => {
              setJarvisSettings({ voiceName });
              setPreferredVoice(voiceName);
              // Câu nghe thử không có tên gọi, và tạm ngừng nghe tên trong lúc đọc để không tự gọi chính mình.
              const listening = listenMode.current === 'wake';
              if (listening) stopListening();
              void speak('Xin chào, đây là giọng đọc của trợ lý điều hành.').then(() => {
                if (listening && voiceRef.current === 'idle') startWake();
              });
            }}
            popupMatchSelectWidth={false}
          />
        </Flex>
      )}
      {settings.wake && canListen && voiceSupport.secure && (
        <Flex vertical gap={2}>
          <span>Micro nghe được gần nhất</span>
          <Typography.Text type="secondary" className="jarvis-last-heard">
            {lastHeard ? `“${lastHeard}”` : 'Chưa nghe thấy gì — thử nói “Hey Jarvis”'}
          </Typography.Text>
        </Flex>
      )}
      {!canListen ? (
        <Typography.Text type="secondary">Trình duyệt này chưa hỗ trợ nhận dạng giọng nói (dùng Chrome hoặc Edge)</Typography.Text>
      ) : !voiceSupport.secure ? (
        <Typography.Text type="secondary">Micro chỉ dùng được trên kết nối HTTPS</Typography.Text>
      ) : (
        <Typography.Text type="secondary">Giọng nói được trình duyệt chuyển tới dịch vụ nhận dạng của Google/Microsoft</Typography.Text>
      )}
    </Flex>
  );

  const status = STATUS_TEXT[voice];

  return (
    <>
    {hud && (
      <JarvisHud
        phase={hud.phase}
        caption={hud.caption}
        signal={signal}
        leaving={hudLeaving}
        onDismiss={() => {
          hudHiddenRef.current = true;
          closeHud();
        }}
      />
    )}
    <Drawer
      title={
        <Flex align="center" gap={10}>
          <JarvisMark size={26} state={voice} />
          <Flex vertical>
            <span className="jarvis-name">Jarvis</span>
            {status && <span className={`jarvis-status ${voice}`}>{status}</span>}
          </Flex>
        </Flex>
      }
      open={open}
      onClose={onClose}
      size={460}
      mask={false}
      className="jarvis-drawer"
      extra={
        <Space size={2}>
          {bubbles.length > 0 && (
            <Tooltip title="Xoá hội thoại">
              <Button type="text" icon={<ClearOutlined />} onClick={() => setBubbles([])} aria-label="Xoá hội thoại" />
            </Tooltip>
          )}
          <Popover content={settingsPanel} trigger="click" placement="bottomRight" title="Giọng nói">
            <Button type="text" icon={<SettingOutlined />} aria-label="Cài đặt giọng nói" />
          </Popover>
        </Space>
      }
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      footer={
        <Flex gap={8} align="flex-end">
          <Input.TextArea
            value={text}
            onChange={event => setText(event.target.value)}
            autoSize={{ minRows: 1, maxRows: 4 }}
            placeholder={listenMode.current === 'talk' ? 'Đang nghe…' : 'Hỏi Jarvis về chỉ tiêu, văn bản, đề xuất'}
            onPressEnter={event => {
              if (!event.shiftKey) {
                event.preventDefault();
                void send(text);
              }
            }}
          />
          {canListen && (
            <Tooltip title={!voiceSupport.secure ? 'Micro chỉ dùng được trên kết nối HTTPS' : listenMode.current === 'talk' ? 'Dừng nghe' : 'Nói với Jarvis'}>
              <Button
                className={`jarvis-mic${listenMode.current === 'talk' ? ' on' : ''}`}
                icon={<AudioOutlined />}
                disabled={!voiceSupport.secure || sending}
                onClick={talk}
                aria-label="Nói với Jarvis"
              />
            </Tooltip>
          )}
          <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void send(text)} aria-label="Gửi" />
        </Flex>
      }
    >
      <div className="copilot-thread">
        {bubbles.length === 0 && (
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            {SUGGESTIONS.map(item => (
              <Button key={item} block style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => void send(item)}>
                {item}
              </Button>
            ))}
          </Space>
        )}
        {bubbles.map(bubble =>
          bubble.role === 'user' ? (
            <div key={bubble.id} className="bubble user">
              {bubble.voice && <AudioOutlined className="bubble-voice" />}
              {bubble.text}
            </div>
          ) : (
            <div key={bubble.id} className="bubble assistant">
              {bubble.error ? (
                <Typography.Text type="danger">{bubble.error}</Typography.Text>
              ) : bubble.answer ? (
                <>
                  <div className="pre-line">{bubble.answer.reply}</div>
                  <Rows answer={bubble.answer} />
                  {bubble.answer.pendingAction && (
                    <Flex gap={8} style={{ marginTop: 10 }}>
                      {bubble.action === 'pending' || bubble.action === 'busy' ? (
                        <>
                          <Button type="primary" size="small" loading={bubble.action === 'busy'} onClick={() => void decide(bubble.id, bubble.answer!.pendingAction!.id, true)}>
                            Xác nhận duyệt {bubble.answer.pendingAction.approveCount}
                          </Button>
                          <Button size="small" disabled={bubble.action === 'busy'} onClick={() => void decide(bubble.id, bubble.answer!.pendingAction!.id, false)}>
                            Huỷ
                          </Button>
                          <span className="entry-meta" style={{ alignSelf: 'center' }}>
                            Hết hạn {dateTime(bubble.answer.pendingAction.expiresAt)}
                          </span>
                        </>
                      ) : (
                        <Tag>{bubble.action === 'done' ? 'Đã thực hiện' : 'Đã huỷ'}</Tag>
                      )}
                    </Flex>
                  )}
                </>
              ) : null}
            </div>
          ),
        )}
        {voice === 'listening' && (
          <div className="jarvis-heard" aria-live="polite">
            <span className="jarvis-wave" aria-hidden>
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>{heard || (listenMode.current === 'talk' ? text : '') || 'Đang nghe…'}</span>
          </div>
        )}
        {sending && <div className="bubble assistant typing">…</div>}
        <div ref={bottom} />
      </div>
    </Drawer>
    </>
  );
}
