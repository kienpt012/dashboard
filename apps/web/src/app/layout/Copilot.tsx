import { ClearOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Flex, Input, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorText, http } from '@/lib/api';
import { dateTime, num, pct } from '@/lib/format';
import type { CopilotResponse } from '@/types/core';

const SUGGESTIONS = ['Tình hình thực hiện năm nay', 'Chỉ tiêu nào sắp trễ hạn?', 'Chỉ tiêu nào chưa có số liệu?', 'Đề xuất nào đang chờ xác minh?'];

type Bubble =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; answer?: CopilotResponse; error?: string; action?: 'pending' | 'busy' | 'done' | 'cancelled' };

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
            { title: 'Chỉ tiêu', dataIndex: 'title', render: (value, row) => <><Typography.Text type="secondary">{row.code}</Typography.Text> {value}</> },
            { title: 'Phòng', dataIndex: 'department', width: 120 },
            { title: 'Tiến độ', dataIndex: 'progress', width: 80, align: 'right', render: value => pct(value) },
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

export function Copilot({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const counter = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [bubbles]);

  async function send(value: string) {
    const content = value.trim();
    if (!content || sending) return;
    const userId = ++counter.current;
    const replyId = ++counter.current;
    setBubbles(list => [...list, { id: userId, role: 'user', text: content }]);
    setText('');
    setSending(true);
    try {
      const answer = await http.post<CopilotResponse>('/copilot/messages', { message: content });
      setBubbles(list => [...list, { id: replyId, role: 'assistant', answer, action: answer.pendingAction ? 'pending' : undefined }]);
    } catch (error) {
      setBubbles(list => [...list, { id: replyId, role: 'assistant', error: errorText(error) }]);
    } finally {
      setSending(false);
    }
  }

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

  return (
    <Drawer
      title="Trợ lý"
      open={open}
      onClose={onClose}
      size={460}
      mask={false}
      extra={
        bubbles.length > 0 && (
          <Button type="text" icon={<ClearOutlined />} onClick={() => setBubbles([])}>
            Xoá
          </Button>
        )
      }
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      footer={
        <Flex gap={8}>
          <Input.TextArea
            value={text}
            onChange={event => setText(event.target.value)}
            autoSize={{ minRows: 1, maxRows: 4 }}
            placeholder="Hỏi về chỉ tiêu, văn bản, đề xuất"
            onPressEnter={event => {
              if (!event.shiftKey) {
                event.preventDefault();
                void send(text);
              }
            }}
          />
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
        {sending && <div className="bubble assistant typing">…</div>}
        <div ref={bottom} />
      </div>
    </Drawer>
  );
}
