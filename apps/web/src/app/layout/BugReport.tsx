import { BugOutlined, PictureOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Form, Input, Modal, Tooltip, Upload } from 'antd';
import { useState, type ClipboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '@/app/session';
import { errorText, http } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { routeInfo } from '../nav';

/** Báo lỗi màn hình đang xem: tự gửi kèm địa chỉ, mã màn hình, khung nhìn, thời điểm và ảnh (dán bằng Ctrl+V). */
export function BugReport() {
  const location = useLocation();
  const user = useUser();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [form] = Form.useForm<{ description: string }>();
  const screen = routeInfo(location.pathname, false).screen;

  function start() {
    setOpenedAt(new Date());
    setFile(null);
    form.resetFields();
    setOpen(true);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const image = [...event.clipboardData.files].find(item => item.type.startsWith('image/'));
    if (image) {
      event.preventDefault();
      setFile(image);
    }
  }

  async function submit() {
    const { description } = await form.validateFields();
    setSending(true);
    try {
      const body = new FormData();
      body.set('description', description.trim());
      body.set('url', window.location.href);
      body.set('pageTitle', document.title);
      body.set('screenCode', screen);
      body.set('viewport', `${window.innerWidth}×${window.innerHeight}`);
      if (file) body.set('screenshot', file);
      await http.post('/bug-reports', body);
      message.success('Đã gửi báo lỗi');
      setOpen(false);
    } catch (error) {
      message.error(errorText(error, 'Không gửi được báo lỗi'));
    } finally {
      setSending(false);
    }
  }

  if (!user || user.role === 'VIEWER') return null;

  return (
    <>
      <Tooltip title="Báo lỗi màn hình này">
        <Button type="text" icon={<BugOutlined />} onClick={start} aria-label="Báo lỗi" className="head-btn" />
      </Tooltip>
      <Modal title="Báo lỗi" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} okText="Gửi" confirmLoading={sending} width={560} destroyOnHidden>
        <Descriptions
          size="small"
          column={1}
          bordered
          style={{ marginBottom: 16 }}
          items={[
            { label: 'Màn hình', children: screen },
            { label: 'Thời điểm', children: dateTime(openedAt) },
            { label: 'Địa chỉ', children: <span className="break-all">{window.location.pathname + window.location.search}</span> },
          ]}
        />
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="description" label="Mô tả" rules={[{ required: true, min: 5, message: 'Mô tả ít nhất 5 ký tự' }]}>
            <Input.TextArea rows={5} maxLength={4000} showCount onPaste={onPaste} placeholder="Dán ảnh chụp bằng Ctrl+V" />
          </Form.Item>
        </Form>
        <Upload
          accept="image/png,image/jpeg,image/webp"
          maxCount={1}
          beforeUpload={value => {
            setFile(value);
            return false;
          }}
          onRemove={() => setFile(null)}
          fileList={file ? [{ uid: '1', name: file.name || 'anh-chup.png', status: 'done' }] : []}
        >
          <Button icon={<PictureOutlined />}>Đính kèm ảnh</Button>
        </Upload>
      </Modal>
    </>
  );
}
