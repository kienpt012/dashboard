import { Form, Input, Modal } from 'antd';
import { useEffect, type ReactNode } from 'react';

/** Hộp thoại xin lý do trước một thao tác (trả lại, từ chối, lưu trữ…). */
export function ReasonModal({
  open,
  title,
  label = 'Lý do',
  okText = 'Xác nhận',
  danger,
  min = 5,
  max = 2000,
  initial,
  loading,
  extra,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: ReactNode;
  label?: string;
  okText?: string;
  danger?: boolean;
  min?: number;
  max?: number;
  initial?: string;
  loading?: boolean;
  extra?: ReactNode;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [form] = Form.useForm<{ reason: string }>();
  useEffect(() => {
    if (open) form.setFieldsValue({ reason: initial ?? '' });
  }, [open, initial, form]);
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={okText}
      okButtonProps={{ danger }}
      confirmLoading={loading}
      destroyOnHidden
      width={520}
    >
      {extra}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={values => onSubmit(values.reason.trim())}>
        <Form.Item name="reason" label={label} rules={[{ required: true, whitespace: true, min, message: `Ít nhất ${min} ký tự` }]}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={max} showCount autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
