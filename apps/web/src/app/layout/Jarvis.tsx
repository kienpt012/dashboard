import { AudioOutlined, ClearOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Flex, Input, Popover, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorText, http } from '@/lib/api';
import { dateTime, num, pct } from '@/lib/format';
import type { CopilotResponse } from '@/types/core';
import { setJarvisSettings, useJarvisSettings } from './jarvis/settings';
import { afterWakeWord, canSpeakVietnamese, chime, createRecognition, recognitionError, speak, stopSpeaking, transcriptOf, voiceSupport, type Recognition } from './jarvis/voice';

// Jarvis — trợ lý điều hành: hỏi bằng chữ hoặc giọng nói, gọi bằng tên "Jarvis", đọc câu trả lời.
// Lệnh có ghi dữ liệu luôn chờ người dùng bấm xác nhận; không xác nhận bằng giọng nói.

const SUGGESTIONS = ['Tình hình thực hiện năm nay', 'Chỉ tiêu nào sắp trễ hạn?', 'Chỉ tiêu nào chưa có số liệu?', 'Đề xuất nào đang chờ xác minh?'];
const COMMAND_WAIT_MS = 8000;

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
  speaking: 'Đang trả lời',
};

export function Jarvis({
  open,
  onOpen,
  onClose,
  onVoiceState,
  onHeard,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onVoiceState?: (state: JarvisVoiceState) => void;
  /** Câu trình duyệt vừa nghe được khi đang chờ gọi tên — để hiện cho người dùng biết micro đang nghe gì. */
  onHeard?: (text: string) => void;
}) {
  const { message } = App.useApp();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const settings = useJarvisSettings();
  const [voice, setVoice] = useState<JarvisVoiceState>('off');
  const [heard, setHeard] = useState('');
  const counter = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const recognition = useRef<Recognition | null>(null);
  /** Kiểu phiên nghe đang chạy: chờ tên gọi (liên tục) hay bấm để nói (một câu). */
  const listenMode = useRef<'wake' | 'talk' | null>(null);
  const voiceRef = useRef(voice);
  const settingsRef = useRef(settings);
  const commandTimer = useRef<number | undefined>(undefined);
  const busyRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  const onHeardRef = useRef(onHeard);
  const canListen = voiceSupport.recognition;

  settingsRef.current = settings;
  onOpenRef.current = onOpen;
  onHeardRef.current = onHeard;

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

  const send = useCallback(
    async (value: string, viaVoice = false) => {
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
    },
    [],
  );

  // ---------------------------------------------------------------- Nghe

  const stopListening = useCallback(() => {
    window.clearTimeout(commandTimer.current);
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

  const startWake = useCallback(() => {
    if (!canListen || !settingsRef.current.wake || recognition.current) return;
    const rec = createRecognition(true);
    if (!rec) return;
    let awaiting = false;
    const finish = () => {
      awaiting = false;
      window.clearTimeout(commandTimer.current);
      setHeard('');
    };
    const dispatch = (command: string) => {
      finish();
      void handleVoiceCommand(command);
    };
    rec.onresult = event => {
      if (voiceRef.current === 'thinking' || voiceRef.current === 'speaking') return;
      const { finalText, interimText } = transcriptOf(event.results, event.resultIndex);
      if (!awaiting) {
        const rest = afterWakeWord(finalText || interimText);
        if (rest === null) {
          onHeardRef.current?.(interimText || finalText);
          return;
        }
        onHeardRef.current?.('');
        awaiting = true;
        chime();
        onOpenRef.current();
        updateVoice('listening');
        commandTimer.current = window.setTimeout(() => {
          finish();
          if (voiceRef.current === 'listening') updateVoice('idle');
        }, COMMAND_WAIT_MS);
        if (finalText && rest.length > 1) dispatch(rest);
        else setHeard(rest);
        return;
      }
      if (interimText) setHeard(afterWakeWord(interimText) ?? interimText);
      if (finalText) {
        const command = afterWakeWord(finalText) ?? finalText;
        if (command.trim().length > 1) dispatch(command);
      }
    };
    rec.onerror = event => {
      const text = recognitionError(event.error);
      if (text) {
        message.error(text);
        setJarvisSettings({ wake: false });
      }
    };
    rec.onend = () => {
      // Chrome tự ngắt phiên nghe dài; mở lại nếu vẫn đang bật chế độ gọi tên.
      if (recognition.current !== rec) return;
      recognition.current = null;
      window.setTimeout(() => {
        if (settingsRef.current.wake && voiceRef.current !== 'thinking' && voiceRef.current !== 'speaking') startWake();
      }, 300);
    };
    recognition.current = rec;
    listenMode.current = 'wake';
    try {
      rec.start();
      if (voiceRef.current === 'off') updateVoice('idle');
    } catch {
      recognition.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canListen, message, updateVoice]);

  /** Sau khi trả lời: quay về chờ tên gọi (nếu bật) hoặc tắt. */
  const resume = useCallback(() => {
    if (settingsRef.current.wake) {
      updateVoice('idle');
      startWake();
    } else updateVoice('off');
  }, [startWake, updateVoice]);

  async function handleVoiceCommand(command: string) {
    stopListening();
    updateVoice('thinking');
    const answer = await send(command, true);
    if (answer && settingsRef.current.readAloud && canSpeakVietnamese()) {
      updateVoice('speaking');
      await speak(answer.reply);
    }
    resume();
  }

  /** Bấm để nói: nghe một câu, điền vào ô nhập, nói xong thì gửi. */
  function talk() {
    if (listenMode.current === 'talk') {
      stopListening();
      resume();
      return;
    }
    stopListening();
    stopSpeaking();
    const rec = createRecognition(false);
    if (!rec) return;
    let latest = '';
    rec.onresult = event => {
      const { finalText, interimText } = transcriptOf(event.results, 0);
      latest = finalText || interimText;
      setText(latest);
    };
    rec.onerror = event => {
      const text = recognitionError(event.error);
      if (text) message.error(text);
    };
    rec.onend = () => {
      if (recognition.current !== rec) return;
      recognition.current = null;
      listenMode.current = null;
      if (latest.trim()) void handleVoiceCommand(latest);
      else resume();
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
      if (!recognition.current) startWake();
    } else if (listenMode.current === 'wake') {
      stopListening();
      updateVoice('off');
    }
  }, [settings.wake, canListen, startWake, stopListening, updateVoice]);

  // Dọn khi rời khung quản trị.
  useEffect(
    () => () => {
      stopListening();
      stopSpeaking();
    },
    [stopListening],
  );

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
          checked={settings.wake}
          disabled={!canListen || !voiceSupport.secure}
          onChange={wake => {
            if (wake) chime();
            setJarvisSettings({ wake });
          }}
        />
      </Flex>
      <Flex justify="space-between" align="center" gap={12}>
        <span>Đọc câu trả lời</span>
        <Switch checked={settings.readAloud} disabled={!voiceSupport.speech} onChange={readAloud => setJarvisSettings({ readAloud })} />
      </Flex>
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
  );
}
