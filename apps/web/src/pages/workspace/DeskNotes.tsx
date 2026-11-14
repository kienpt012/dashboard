import { CheckOutlined, CloseOutlined, CommentOutlined, FileTextOutlined, HolderOutlined, PushpinOutlined, SendOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Checkbox, Drawer, Empty, Form, Input, Modal, Select, Space, Spin, Table, Tag, Tooltip } from 'antd';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { DocumentViewer } from '@/components/DocumentViewer';
import { useAction, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { roleLabel } from '@/lib/roles';
import type { Role } from '@/types/auth';
import type { DeskNote, DeskNotesData, DeskRecipientsData } from './desk-api';
import './desk.css';

const REFRESH = ['/workspace/notes', '/workspace/briefing', '/workspace/apps', '/notifications'];
const COLORS = [{ value: 'yellow', label: 'Vàng' }, { value: 'pink', label: 'Hồng' }, { value: 'blue', label: 'Xanh lam' }, { value: 'green', label: 'Xanh lá' }];

export function dueLabel(dueAt: string, now = Date.now()) {
  const minutes = Math.ceil((new Date(dueAt).getTime() - now) / 60_000);
  if (minutes < 0) return `Quá hạn ${-minutes < 60 ? `${-minutes} phút` : -minutes < 1440 ? `${Math.floor(-minutes / 60)} giờ` : `${Math.floor(-minutes / 1440)} ngày`}`;
  if (minutes < 60) return `Còn ${minutes} phút`;
  if (minutes < 1440) return `Còn ${Math.floor(minutes / 60)} giờ`;
  return `Còn ${Math.ceil(minutes / 1440)} ngày`;
}

export function NoteComposerButton({ targetId, targetName, menu = false }: { targetId?: string; targetName?: string; menu?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><Button type={menu ? 'text' : 'default'} className={menu ? 'desk-note-menu-action' : 'desk-compose-button'} icon={<PushpinOutlined />} onClick={() => setOpen(true)}>{targetId ? 'Dán note nhắc việc' : 'Dán note'}</Button><NoteComposer open={open} onClose={() => setOpen(false)} targetId={targetId} targetName={targetName} /></>;
}

export function useDeskNoteAction(targetId: string, targetName: string) {
  const [open, setOpen] = useState(false);
  return { item: { key: 'desk-note', icon: <PushpinOutlined />, label: 'Dán note nhắc việc', onClick: () => setOpen(true) }, modal: <NoteComposer open={open} onClose={() => setOpen(false)} targetId={targetId} targetName={targetName} /> };
}

export function NoteComposer({ open, onClose, targetId: presetTarget, targetName }: { open: boolean; onClose: () => void; targetId?: string; targetName?: string }) {
  const me = useMe();
  const [form] = Form.useForm();
  const [targetId, setTargetId] = useState(presetTarget);
  const [all, setAll] = useState(false);
  const recipients = useApi<DeskRecipientsData>(open ? `/workspace/note-recipients${targetId ? `?targetId=${encodeURIComponent(targetId)}` : ''}` : null);
  const targets = useApi<{ id: string; title: string }[]>(open && !presetTarget ? '/targets' : null);
  useEffect(() => { if (open) { form.resetFields(); setTargetId(presetTarget); setAll(false); form.setFieldsValue({ color: 'yellow', recipientIds: me.role === 'VIEWER' ? [me.id] : [], departmentIds: [], roles: [] }); } }, [open, presetTarget, form, me.id, me.role]);
  useEffect(() => { if (open && recipients.data && targetId) form.setFieldValue('recipientIds', recipients.data.defaultRecipientIds); }, [open, targetId, recipients.data, form]);
  const save = useAction((values: Record<string, unknown>) => http.post('/workspace/notes', { ...values, content: String(values.content).trim(), dueAt: values.dueAt ? new Date(String(values.dueAt)).toISOString() : undefined, targetId, all }), { success: 'Đã dán note', refresh: REFRESH, onDone: onClose });
  return <Modal title="Dán note" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Dán note" cancelText="Hủy" confirmLoading={save.isPending} width={620} destroyOnHidden>
    {recipients.error && <Alert type="error" showIcon title="Chưa tải được người nhận" action={<Button onClick={() => void recipients.refetch()}>Thử lại</Button>} />}
    <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} className="desk-compose-form">
      <Form.Item label="Chỉ tiêu">{presetTarget ? <Tag>{targetName || 'Chỉ tiêu đang xem'}</Tag> : <Select allowClear showSearch optionFilterProp="label" placeholder="Không gắn chỉ tiêu" value={targetId} onChange={setTargetId} loading={targets.isLoading} options={(targets.data ?? []).map(t => ({ value: t.id, label: t.title }))} />}</Form.Item>
      {recipients.data?.canBroadcast && <Checkbox checked={all} onChange={event => setAll(event.target.checked)}>Toàn cơ quan</Checkbox>}
      <Form.Item name="recipientIds" label="Người nhận" rules={[{ validator: async (_, value) => { if (!all && !value?.length && !form.getFieldValue('departmentIds')?.length && !form.getFieldValue('roles')?.length) throw new Error('Chọn ít nhất một người nhận'); } }]}><Select mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" disabled={all || me.role === 'VIEWER'} loading={recipients.isLoading} placeholder="Chọn cán bộ" options={(recipients.data?.users ?? []).map(u => ({ value: u.id, label: `${u.fullName} · ${u.username}${u.position ? ` · ${u.position}` : ''}` }))} /></Form.Item>
      {!!recipients.data?.departments.length && <Form.Item name="departmentIds" label="Theo phòng"><Select mode="multiple" disabled={all} options={recipients.data.departments.map(d => ({ value: d.id, label: d.name }))} /></Form.Item>}
      {!!recipients.data?.roles.length && <Form.Item name="roles" label="Theo vai trò"><Select mode="multiple" disabled={all} options={recipients.data.roles.map(role => ({ value: role, label: roleLabel[role] }))} /></Form.Item>}
      <Form.Item name="content" label="Nội dung" rules={[{ required: true, whitespace: true, message: 'Nhập nội dung note' }, { max: 500 }]}><Input.TextArea showCount maxLength={500} autoSize={{ minRows: 4, maxRows: 8 }} /></Form.Item>
      <div className="desk-form-pair"><Form.Item name="color" label="Màu giấy"><Select options={COLORS} /></Form.Item><Form.Item name="dueAt" label="Hạn hoàn thành"><Input type="datetime-local" /></Form.Item></div>
    </Form>
  </Modal>;
}

function NoteConversation({ note, onClose }: { note: DeskNote | null; onClose: () => void }) {
  const [content, setContent] = useState('');
  useEffect(() => setContent(''), [note?.id]);
  const reply = useAction(() => http.post(`/workspace/notes/${note!.id}/replies`, { content: content.trim() }), { success: 'Đã gửi trả lời', refresh: REFRESH, onDone: () => setContent('') });
  return <Drawer title="Trao đổi note" open={!!note} onClose={onClose} size={460}>
    {note && <><div className={`desk-paper desk-paper-${note.color} desk-paper-static`}><strong>{note.author.fullName}</strong><p>{note.content}</p></div><div className="desk-replies">{note.replies.map((r, index) => <article key={r.id ?? index}><strong>{r.author.fullName}</strong><time>{dateTime(r.createdAt)}</time><p>{r.content}</p></article>)}{!note.replies.length && <Empty description="Chưa có trả lời" image={Empty.PRESENTED_IMAGE_SIMPLE} />}</div><Input.TextArea aria-label="Nội dung trả lời" maxLength={300} showCount value={content} onChange={event => setContent(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} /><Button style={{ marginTop: 20 }} type="primary" icon={<SendOutlined />} loading={reply.isPending} disabled={!content.trim() || !!note.recalledAt} onClick={() => reply.mutate()}>Trả lời</Button></>}
  </Drawer>;
}

function Paper({ note, index, area, onReply, onDocument, staticPaper = false }: { note: DeskNote; index: number; area?: HTMLDivElement | null; onReply: () => void; onDocument: (id: string) => void; staticPaper?: boolean }) {
  const me = useMe();
  const own = note.recipients.find(r => r.userId === me.id);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const paper = useRef<HTMLElement>(null);
  const patch = useAction((data: Record<string, unknown>) => http.patch(`/workspace/notes/${note.id}/recipient`, data), { refresh: REFRESH });
  useEffect(() => { setPosition(own?.x != null && own.y != null ? { x: own.x, y: own.y } : null); }, [own?.x, own?.y]);
  useEffect(() => {
    if (!own || own.seenAt || !paper.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); patch.mutate({ seen: true }); } }, { threshold: .6 });
    observer.observe(paper.current);
    return () => observer.disconnect();
  }, [note.id, own?.seenAt, staticPaper]);
  function clamp(x: number, y: number) { return { x: Math.round(Math.max(0, Math.min((area?.clientWidth ?? 600) - 280, x))), y: Math.round(Math.max(0, Math.min(1500, y))) }; }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (staticPaper || !area || event.button !== 0) return;
    event.preventDefault();
    const rect = paper.current!.getBoundingClientRect(), bounds = area.getBoundingClientRect();
    const p = position ?? { x: rect.left - bounds.left, y: rect.top - bounds.top };
    setPosition(p); drag.current = { ...p, startX: event.clientX, startY: event.clientY }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) { if (drag.current) setPosition(clamp(drag.current.x + event.clientX - drag.current.startX, drag.current.y + event.clientY - drag.current.startY)); }
  function end() { if (!drag.current) return; drag.current = null; setDragging(false); if (position) patch.mutate(position); }
  const style = { '--paper-rotation': `${index % 2 ? 1.3 : -1.1}deg`, ...(position && !staticPaper ? { left: position.x, top: position.y, right: 'auto' } : { top: index * 30, right: index * 13 }), zIndex: dragging ? 50 : 10 + index } as unknown as CSSProperties;
  return <article ref={paper} className={`desk-paper desk-paper-${note.color}${staticPaper ? ' desk-paper-static' : ''}${own?.doneAt ? ' desk-paper-done' : ''}`} style={style} aria-label={`Note của ${note.author.fullName}`}>
    <header><div><strong>{note.author.fullName}</strong><small>{note.author.position || (note.author.role ? roleLabel[note.author.role as Role] : note.author.username)}</small></div>{!staticPaper && <Tooltip title="Kéo để di chuyển. Dùng phím mũi tên khi chọn nút này."><button className="desk-paper-handle" aria-label={`Di chuyển note của ${note.author.fullName}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event => { const delta: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }; const step = delta[event.key]; if (!step) return; event.preventDefault(); const p = clamp((position?.x ?? Math.max(0, (area?.clientWidth ?? 600) - 300)) + step[0], (position?.y ?? index * 30) + step[1]); setPosition(p); patch.mutate(p); }}><HolderOutlined /></button></Tooltip>}</header>
    <p className="desk-paper-content">{note.content}</p>
    {note.dueAt && <time className={`desk-note-due${new Date(note.dueAt).getTime() < Date.now() && !own?.doneAt ? ' overdue' : ''}`} dateTime={note.dueAt} title={dateTime(note.dueAt)}>{dueLabel(note.dueAt)} · {dateTime(note.dueAt)}</time>}
    {note.target && <Link className="desk-note-link" to={`/admin/targets/${note.target.id}`}><PushpinOutlined /> {note.target.title}</Link>}
    {note.document && <button className="desk-note-link" onClick={() => onDocument(note.document!.id)}><FileTextOutlined /> {note.document.docNumber || note.document.title}</button>}
    <footer>{own && <button disabled={patch.isPending} onClick={() => patch.mutate({ done: !own.doneAt })}><CheckOutlined />{own.doneAt ? 'Đã xong' : 'Đánh dấu xong'}</button>}<button onClick={onReply}><CommentOutlined />Trả lời{note.replies.length > 0 ? ` (${note.replies.length})` : ''}</button>{own && <Tooltip title="Gỡ khỏi bàn"><button aria-label="Gỡ khỏi bàn" disabled={patch.isPending} onClick={() => patch.mutate({ hidden: true })}><CloseOutlined /></button></Tooltip>}</footer>
  </article>;
}

export function DeskNotesLayer() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const notes = useApi<DeskNotesData>('/workspace/notes', { refetchInterval: 30_000 });
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [conversation, setConversation] = useState<string | null>(null);
  const detail = useApi<DeskNote>(conversation ? `/workspace/notes/${encodeURIComponent(conversation)}` : null, { refetchInterval: 30_000 });
  const [doc, setDoc] = useState<string | null>(null);
  const received = (notes.data?.received ?? []).filter(n => !n.recalledAt && !n.recipients.find(r => r.userId === me.id)?.hiddenAt);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { const open = () => setExpanded(true); window.addEventListener('ioc:desk-notes-open', open); return () => window.removeEventListener('ioc:desk-notes-open', open); }, []);
  useEffect(() => { const id = params.get('note'); if (!id) return; setConversation(id); const next = new URLSearchParams(params); next.delete('note'); setParams(next, { replace: true }); }, [params, setParams]);
  const seen = useAction((id: string) => http.patch(`/workspace/notes/${id}/recipient`, { seen: true }), { refresh: REFRESH });
  useEffect(() => { const recipient = detail.data?.recipients.find(r => r.userId === me.id); if (detail.data && recipient && !recipient.seenAt) seen.mutate(detail.data.id); }, [detail.data?.id, detail.data?.recipients.find(r => r.userId === me.id)?.seenAt, me.id]);
  const current = received.find(n => n.id === selected) ?? received[0];
  const visible = received.slice(0, 4);
  return <section className="desk-notes-section" aria-label="Giấy note nhận được">
    <div className="desk-section-heading"><h2><PushpinOutlined /> Giấy note <Badge count={received.length} showZero color="#64748b" /></h2><Button size="small" onClick={() => setExpanded(true)}>Xem tất cả</Button></div>
    {notes.error ? <Alert type="warning" title="Chưa tải được note" action={<Button onClick={() => void notes.refetch()}>Thử lại</Button>} /> : notes.isLoading ? <Spin /> : !received.length ? <div className="desk-brief-empty">Chưa có note</div> : <>
      <div className="desk-paper-area" ref={setArea} style={{ minHeight: Math.max(310, ...visible.map(n => (n.recipients.find(r => r.userId === me.id)?.y ?? 0) + 310)) }}><div className="desk-note-picker">{received.map(n => <button key={n.id} className={current?.id === n.id ? 'active' : ''} onClick={() => { setSelected(n.id); setConversation(n.id); }}><span className={`desk-paper-dot ${n.color}`} /><strong>{n.author.fullName}</strong><span>{n.content}</span></button>)}</div>{visible.map((n, i) => <Paper key={n.id} note={n} index={i} area={area} onReply={() => setConversation(n.id)} onDocument={setDoc} />)}</div>
      <button className="desk-mobile-stack" onClick={() => setExpanded(true)}><PushpinOutlined /><span><strong>{received.length} giấy note</strong><small>{current?.author.fullName}: {current?.content}</small></span><Badge count={received.filter(n => !n.recipients.find(r => r.userId === me.id)?.seenAt).length} /></button>
    </>}
    <Drawer title="Giấy note nhận được" open={expanded} onClose={() => setExpanded(false)} size={620}><div className="desk-note-list">{received.map((n, i) => <Paper staticPaper key={n.id} note={n} index={i} onReply={() => setConversation(n.id)} onDocument={setDoc} />)}{!received.length && <Empty description="Chưa có note" />}</div></Drawer>
    {conversation && detail.error && <Alert type="warning" title="Không mở được note" description="Note không còn hiệu lực hoặc bạn không có quyền đọc." closable onClose={() => setConversation(null)} />}
    <NoteConversation note={detail.data ?? [...(notes.data?.received ?? []), ...(notes.data?.sent ?? [])].find(n => n.id === conversation) ?? null} onClose={() => setConversation(null)} />
    <DocumentViewer id={doc} onClose={() => setDoc(null)} />
  </section>;
}

export function SentNotesWidget() {
  const notes = useApi<DeskNotesData>('/workspace/notes', { refetchInterval: 30_000 });
  const { modal } = App.useApp();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<string | null>(null);
  const recall = useAction((id: string) => http.post(`/workspace/notes/${id}/recall`), { success: 'Đã thu hồi note', refresh: REFRESH });
  const rows = notes.data?.sent ?? [];
  return <div className="desk-sent-widget">{notes.error ? <Alert type="warning" title="Chưa tải được note đã dán" /> : notes.isLoading ? <Spin /> : !rows.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa dán note" /> : <div className="desk-sent-list">{rows.slice(0, 5).map(n => <button key={n.id} onClick={() => { setOpen(true); }}><strong>{n.target?.title || n.content}</strong><span>{n.recipients.length} người nhận · {n.recipients.filter(r => r.seenAt).length} đã xem · {n.recipients.filter(r => r.doneAt).length} đã xong</span>{n.recalledAt && <Tag>Đã thu hồi</Tag>}</button>)}</div>}<Button size="small" onClick={() => setOpen(true)}>Note đã dán</Button>
    <Drawer title="Note đã dán" open={open} onClose={() => setOpen(false)} size={900}><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 650 }} columns={[
      { title: 'Nội dung', render: (_, n) => <div className="desk-sent-content">{n.target && <Link to={`/admin/targets/${n.target.id}`}>{n.target.title}</Link>}<p>{n.content}</p><small>{dateTime(n.createdAt)}</small></div> },
      { title: 'Theo dõi', width: 240, render: (_, n) => <div>{n.recipients.map(r => <div className="desk-recipient-status" key={r.userId}><strong>{r.user.fullName}</strong><small>{r.seenAt ? `Đã xem ${dateTime(r.seenAt)}` : 'Chưa xem'}</small>{r.doneAt && <small>Đã xong {dateTime(r.doneAt)}</small>}</div>)}</div> },
      { title: 'Thao tác', width: 150, render: (_, n) => <Space orientation="vertical"><Button size="small" icon={<CommentOutlined />} onClick={() => setConversation(n.id)}>Trả lời</Button>{n.recalledAt ? <Tag>Đã thu hồi</Tag> : <Button size="small" danger icon={<UndoOutlined />} loading={recall.isPending} onClick={() => modal.confirm({ title: 'Thu hồi note?', content: 'Note sẽ được gỡ khỏi bàn của người nhận.', okText: 'Thu hồi', cancelText: 'Hủy', onOk: () => recall.mutateAsync(n.id) })}>Thu hồi</Button>}</Space> },
    ]} /></Drawer><NoteConversation note={rows.find(n => n.id === conversation) ?? null} onClose={() => setConversation(null)} />
  </div>;
}
