import {
  CopyOutlined, DeleteOutlined, EditOutlined, FilePdfOutlined, LeftOutlined, PlusOutlined, RightOutlined, SaveOutlined, UploadOutlined,
} from '@ant-design/icons';
import { App, AutoComplete, Button, Form, Input, Modal, Popconfirm, Segmented, Select, Switch, Tag, Tooltip, Upload } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/Page';
import { LoadError, Loading } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { errorText, http } from '@/lib/api';
import { dateTime, fileSize } from '@/lib/format';
import { ScheduleWeek } from './ScheduleWeek';
import {
  addDays, SESSIONS, shortDate, weekDays, weekdayName, weekRange,
  type Schedule as ScheduleData, type ScheduleEntry, type ScheduleSession, type ScheduleWeekResponse,
} from './model';

type Draft = ScheduleEntry & { key: string };
type EntryForm = { date: string; session: ScheduleSession; startTime?: string; content: string; leader: string; location?: string; participants?: string; isPublic: boolean };

const LEADER_TITLES = ['Chủ tịch UBND', 'Phó Chủ tịch UBND', 'Chủ tịch HĐND', 'Phó Chủ tịch HĐND', 'Bí thư Đảng uỷ'];
let seq = 0;
const nextKey = () => `moi-${(seq += 1)}`;
const toDraft = (entries: ScheduleEntry[]): Draft[] => entries.map(entry => ({ ...entry, key: entry.id ?? nextKey() }));

function EntryModal({ open, initial, weekStart, leaders, onClose, onSubmit }: {
  open: boolean; initial: Partial<EntryForm>; weekStart: string; leaders: string[]; onClose: () => void; onSubmit: (values: EntryForm) => void;
}) {
  const [form] = Form.useForm<EntryForm>();
  useEffect(() => {
    if (open) form.setFieldsValue({ session: 'AM', isPublic: true, startTime: undefined, location: undefined, participants: undefined, ...initial });
  }, [open, initial, form]);
  return (
    <Modal title={initial.content ? 'Sửa dòng lịch' : 'Thêm dòng lịch'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Xong" cancelText="Huỷ" width={560} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark="optional">
        <div className="form-grid">
          <Form.Item name="date" label="Ngày" rules={[{ required: true, message: 'Chọn ngày' }]}>
            <Select options={weekDays(weekStart).map(day => ({ value: day, label: `${weekdayName(day)}, ${shortDate(day)}` }))} />
          </Form.Item>
          <Form.Item name="startTime" label="Giờ bắt đầu">
            <Input type="time" allowClear />
          </Form.Item>
        </div>
        <Form.Item name="session" label="Buổi" rules={[{ required: true }]}>
          <Segmented options={SESSIONS} />
        </Form.Item>
        <Form.Item name="content" label="Nội dung" rules={[{ required: true, whitespace: true, min: 3, message: 'Ít nhất 3 ký tự' }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={500} showCount />
        </Form.Item>
        <Form.Item name="leader" label="Lãnh đạo chủ trì" rules={[{ required: true, whitespace: true, min: 2, message: 'Ghi người chủ trì' }]}>
          <AutoComplete options={leaders.map(value => ({ value }))} filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} maxLength={120} />
        </Form.Item>
        <Form.Item name="location" label="Địa điểm">
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="participants" label="Thành phần">
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} />
        </Form.Item>
        <Form.Item name="isPublic" label="Hiện trên trang công khai" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function SchedulePage() {
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const week = params.get('tuan') ?? '';
  const path = /^\d{4}-\d{2}-\d{2}$/.test(week) ? `/schedules?week=${week}` : '/schedules';
  const query = useApi<ScheduleWeekResponse>(path);
  const data = query.data;
  const schedule = data?.schedule ?? null;

  const [draft, setDraft] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<{ key?: string; initial: Partial<EntryForm> } | null>(null);
  const [busyFile, setBusyFile] = useState(false);

  // Nạp lại bản nháp khi đổi tuần hoặc máy chủ có phiên bản mới.
  const stamp = `${data?.weekStart ?? ''}:${schedule?.version ?? 0}`;
  useEffect(() => {
    setDraft(toDraft(schedule?.entries ?? []));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  const refresh = ['/schedules', '/public/schedule'];
  const save = useAction(
    () => http.put<ScheduleData>(`/schedules/${data!.weekStart}`, {
      expectedVersion: schedule?.version,
      title: schedule?.title ?? undefined,
      note: schedule?.note ?? undefined,
      entries: draft.map(({ key: _key, id: _id, ...entry }) => ({ ...entry, startTime: entry.startTime || undefined, location: entry.location || undefined, participants: entry.participants || undefined })),
    }),
    { success: 'Đã lưu lịch tuần', refresh },
  );
  const visibility = useAction((isPublic: boolean) => http.post(`/schedules/${data!.weekStart}/visibility`, { isPublic }), {
    success: result => ((result as ScheduleData).isPublic ? 'Đã công khai lịch tuần' : 'Đã ngừng công khai lịch tuần'),
    refresh,
  });
  const copy = useAction(() => http.post(`/schedules/${data!.weekStart}/copy-previous`), { success: 'Đã chép lịch từ tuần trước', refresh });
  const removeFile = useAction(() => http.delete(`/schedules/${data!.weekStart}/file`), { success: 'Đã gỡ tệp lịch', refresh });

  const leaders = useMemo(() => [...new Set([...draft.map(entry => entry.leader), ...LEADER_TITLES])], [draft]);

  if (query.error && !data) return <LoadError error={query.error} retry={() => void query.refetch()} />;
  if (!data) return <Loading tall />;

  const canEdit = data.canEdit;
  const go = (target: string | null) => {
    const move = () => setParams(target ? { tuan: target } : {}, { replace: false });
    if (!dirty) return move();
    modal.confirm({ title: 'Lịch tuần này chưa lưu', content: 'Chuyển tuần sẽ bỏ các thay đổi chưa lưu.', okText: 'Bỏ thay đổi', cancelText: 'Ở lại', onOk: move });
  };

  const submitEntry = (values: EntryForm) => {
    const entry: Draft = { ...values, startTime: values.startTime || null, location: values.location?.trim() || null, participants: values.participants?.trim() || null, key: editing?.key ?? nextKey() };
    setDraft(current => (editing?.key ? current.map(item => (item.key === editing.key ? { ...item, ...entry } : item)) : [...current, entry]));
    setDirty(true);
    setEditing(null);
  };

  async function upload(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return void message.error('Tệp lịch phải là PDF');
    if (file.size > 10 * 1024 * 1024) return void message.error('Tệp vượt quá 10MB');
    const body = new FormData();
    body.append('file', file);
    setBusyFile(true);
    try {
      await http.post(`/schedules/${data!.weekStart}/file`, body);
      message.success('Đã đính kèm tệp lịch');
      await query.refetch();
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setBusyFile(false);
    }
  }

  async function openFile() {
    try {
      const blob = await http.blob(`/schedules/${data!.weekStart}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      message.error(errorText(error, 'Không mở được tệp lịch'));
    }
  }

  const empty = draft.length === 0;
  return (
    <Page
      title="Lịch làm việc"
      tags={
        <>
          {schedule?.isPublic ? <Tag color="green">Đã công khai</Tag> : <Tag>Chưa công khai</Tag>}
          {dirty && <Tag color="orange">Chưa lưu</Tag>}
        </>
      }
      meta={schedule?.updatedAt ? `Cập nhật ${dateTime(schedule.updatedAt)}` : undefined}
      extra={
        <>
          <div className="sched-nav">
            <Button icon={<LeftOutlined />} onClick={() => go(addDays(data.weekStart, -7))} aria-label="Tuần trước" />
            <span className="sched-nav-range">{weekRange(data.weekStart)}</span>
            <Button icon={<RightOutlined />} onClick={() => go(addDays(data.weekStart, 7))} aria-label="Tuần sau" />
            <Button onClick={() => go(null)} disabled={data.today >= data.weekStart && data.today <= data.weekEnd}>
              Tuần này
            </Button>
          </div>
          {canEdit && (
            <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
              Lưu lịch
            </Button>
          )}
        </>
      }
    >
      {canEdit && (
        <div className="toolbar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
            <Button icon={<PlusOutlined />} onClick={() => setEditing({ initial: { date: data.today >= data.weekStart && data.today <= data.weekEnd ? data.today : data.weekStart } })}>
              Thêm dòng lịch
            </Button>
            {empty && !dirty && (
              <Button icon={<CopyOutlined />} loading={copy.isPending} onClick={() => copy.mutate()}>
                Chép từ tuần trước
              </Button>
            )}
            {schedule?.file ? (
              <span className="sched-file">
                <Button icon={<FilePdfOutlined />} onClick={() => void openFile()}>
                  <span className="sched-file-name">{schedule.file.name}</span>
                </Button>
                <span className="muted">{fileSize(schedule.file.size)}</span>
                <Popconfirm title="Gỡ tệp lịch của tuần này?" okText="Gỡ" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => removeFile.mutate()}>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Gỡ tệp lịch" />
                </Popconfirm>
              </span>
            ) : (
              <Upload accept="application/pdf,.pdf" showUploadList={false} beforeUpload={file => { void upload(file); return false; }}>
                <Button icon={<UploadOutlined />} loading={busyFile}>
                  Đính kèm lịch đã ký (PDF)
                </Button>
              </Upload>
            )}
          </div>
          <Tooltip title={dirty ? 'Lưu lịch trước khi đổi trạng thái công khai' : !schedule ? 'Tuần này chưa có lịch' : undefined}>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              Công khai tuần này
              <Switch checked={Boolean(schedule?.isPublic)} disabled={dirty || !schedule} loading={visibility.isPending} onChange={checked => visibility.mutate(checked)} />
            </span>
          </Tooltip>
        </div>
      )}
      {!canEdit && schedule?.file && (
        <div className="toolbar">
          <Button icon={<FilePdfOutlined />} onClick={() => void openFile()}>
            <span className="sched-file-name">{schedule.file.name}</span>
          </Button>
        </div>
      )}
      <ScheduleWeek
        weekStart={data.weekStart}
        entries={draft}
        today={data.today}
        showVisibility
        hideEmptyDays={!canEdit && !empty}
        dayExtra={canEdit ? day => (
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setEditing({ initial: { date: day } })}>
            Thêm
          </Button>
        ) : undefined}
        rowExtra={canEdit ? entry => (
          <>
            <Button type="text" size="small" icon={<EditOutlined />} aria-label="Sửa dòng lịch" onClick={() => setEditing({ key: entry.key, initial: { ...entry, startTime: entry.startTime ?? undefined, location: entry.location ?? undefined, participants: entry.participants ?? undefined, isPublic: entry.isPublic !== false } })} />
            <Popconfirm title="Xoá dòng lịch này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => { setDraft(current => current.filter(item => item.key !== entry.key)); setDirty(true); }}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Xoá dòng lịch" />
            </Popconfirm>
          </>
        ) : undefined}
      />
      <EntryModal open={Boolean(editing)} initial={editing?.initial ?? {}} weekStart={data.weekStart} leaders={leaders} onClose={() => setEditing(null)} onSubmit={submitEntry} />
    </Page>
  );
}
