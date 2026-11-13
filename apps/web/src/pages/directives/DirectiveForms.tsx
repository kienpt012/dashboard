import { Alert, DatePicker, Form, Input, Modal, Select, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { useAction } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { vn } from '@/lib/format';
import { DIRECTIVE_REFRESH } from './shared';
import type { Directive, DirectiveDetail, DirectiveOptions, DirectiveTask } from './types';

type DocumentValues = { name: string; directiveKind: string; docNumber: string; issuedDate: Dayjs; issuer: string; signer?: string; sourceDocumentId?: string };
type TaskValues = { title: string; departmentId: string; dueDate: Dayjs; coordinatorDepartmentIds?: string[]; relatedTargetId?: string };
const required = [{ required: true, message: 'Vui lòng nhập thông tin' }];

export function DirectiveForm({ open, options, directive, onClose, onCreated }: {
  open: boolean; options: DirectiveOptions; directive?: Directive | null; onClose: () => void; onCreated?: (id: string) => void;
}) {
  const [form] = Form.useForm<DocumentValues>();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (directive) form.setFieldsValue({ ...directive, directiveKind: directive.directiveKind ?? undefined, docNumber: directive.docNumber ?? '', issuer: directive.issuer ?? '', signer: directive.signer ?? '', sourceDocumentId: directive.sourceDocumentId ?? undefined, issuedDate: directive.issuedDate ? vn(directive.issuedDate) : undefined });
    else form.setFieldsValue({ issuedDate: dayjs(), directiveKind: options.kinds[0]?.value });
  }, [open, directive, options.kinds, form]);
  const save = useAction((values: DocumentValues) => {
    const payload = { ...values, issuedDate: values.issuedDate.format('YYYY-MM-DD'), sourceDocumentId: values.sourceDocumentId || null };
    return directive ? http.patch<Directive>(`/directives/${directive.id}`, { ...payload, expectedVersion: directive.version }) : http.post<Directive>('/directives', payload);
  }, { success: directive ? 'Đã cập nhật văn bản chỉ đạo' : 'Đã tạo văn bản chỉ đạo', refresh: DIRECTIVE_REFRESH, onDone: result => { onClose(); if (!directive) onCreated?.(result.id); } });
  return <Modal title={directive ? 'Sửa văn bản chỉ đạo' : 'Thêm văn bản chỉ đạo'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" confirmLoading={save.isPending} width={720} destroyOnHidden>
    <Form form={form} layout="vertical" className="form-grid" onFinish={values => save.mutate(values)}>
      <Form.Item name="sourceDocumentId" label="Tệp trong Kho văn bản" className="span-2">
        <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Chọn tệp đã có hoặc nhập thông tin bên dưới" options={options.documents.map(doc => ({ value: doc.id, label: [doc.docNumber, doc.title].filter(Boolean).join(' — ') }))} onChange={id => {
          const doc = options.documents.find(item => item.id === id);
          if (doc) form.setFieldsValue({ name: doc.title, docNumber: doc.docNumber || undefined, issuedDate: doc.issuedDate ? vn(doc.issuedDate) : undefined, issuer: doc.issuer || undefined });
        }} />
      </Form.Item>
      <Form.Item name="docNumber" label="Số ký hiệu" rules={required}><Input maxLength={100} /></Form.Item>
      <Form.Item name="directiveKind" label="Loại văn bản" rules={required}><Select options={options.kinds} /></Form.Item>
      <Form.Item name="name" label="Trích yếu" className="span-2" rules={[...required, { min: 3, max: 500, message: 'Trích yếu từ 3 đến 500 ký tự' }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} showCount /></Form.Item>
      <Form.Item name="issuedDate" label="Ngày ban hành" rules={required}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="issuer" label="Cơ quan ban hành" rules={required}><Input maxLength={300} /></Form.Item>
      <Form.Item name="signer" label="Người ký ban hành" className="span-2"><Input maxLength={200} /></Form.Item>
    </Form>
  </Modal>;
}

export function TaskForm({ open, directive, options, task, onClose }: { open: boolean; directive: DirectiveDetail; options: DirectiveOptions; task?: DirectiveTask | null; onClose: () => void }) {
  const [form] = Form.useForm<TaskValues>();
  const departmentId = Form.useWatch('departmentId', form);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(task ? { title: task.title, departmentId: task.departmentId, dueDate: vn(task.dueDate), coordinatorDepartmentIds: task.coordinators.map(item => item.departmentId), relatedTargetId: task.relatedTargetId || undefined } : { departmentId: options.defaultDepartmentId || undefined });
  }, [open, task, options.defaultDepartmentId, form]);
  const save = useAction((values: TaskValues) => {
    const payload = { ...values, dueDate: values.dueDate.format('YYYY-MM-DD'), coordinatorDepartmentIds: (values.coordinatorDepartmentIds ?? []).filter(id => id !== values.departmentId), relatedTargetId: values.relatedTargetId || null };
    return task ? http.patch(`/directives/${directive.id}/tasks/${task.id}`, { ...payload, expectedVersion: task.version }) : http.post(`/directives/${directive.id}/tasks`, payload);
  }, { success: task ? 'Đã cập nhật nhiệm vụ' : 'Đã thêm nhiệm vụ', refresh: DIRECTIVE_REFRESH, onDone: onClose });
  return <Modal title={task ? 'Sửa nhiệm vụ' : 'Thêm nhiệm vụ'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" width={720} confirmLoading={save.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" className="form-grid" onFinish={values => save.mutate(values)}>
      <Form.Item name="title" label="Nội dung nhiệm vụ" className="span-2" rules={[...required, { min: 3, max: 500, message: 'Nội dung từ 3 đến 500 ký tự' }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} showCount /></Form.Item>
      <Form.Item name="departmentId" label="Phòng chủ trì" rules={required}><Select showSearch={{ optionFilterProp: 'label' }} options={options.departments.map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
      <Form.Item name="dueDate" label="Hạn hoàn thành" rules={required}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="coordinatorDepartmentIds" label="Phòng phối hợp" className="span-2"><Select mode="multiple" allowClear showSearch={{ optionFilterProp: 'label' }} options={options.departments.filter(item => item.id !== departmentId).map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
      <Form.Item name="relatedTargetId" label="Chỉ tiêu liên quan" className="span-2"><Select allowClear showSearch={{ optionFilterProp: 'label' }} options={options.relatedTargets.map(item => ({ value: item.id, label: item.title }))} /></Form.Item>
    </Form>
  </Modal>;
}

export function PasteTasks({ open, directive, options, onClose }: { open: boolean; directive: DirectiveDetail; options: DirectiveOptions; onClose: () => void }) {
  const [form] = Form.useForm<{ text: string; departmentId: string; dueDate?: Dayjs }>();
  const text = Form.useWatch('text', form) ?? '';
  const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
  useEffect(() => { if (open) { form.resetFields(); form.setFieldValue('departmentId', options.defaultDepartmentId || undefined); } }, [open, options.defaultDepartmentId, form]);
  const save = useAction((values: { text: string; departmentId: string; dueDate?: Dayjs }) => http.post<{ created: number }>(`/directives/${directive.id}/paste`, { ...values, dueDate: values.dueDate?.format('YYYY-MM-DD') }), {
    success: result => `Đã thêm ${result.created} nhiệm vụ`, refresh: DIRECTIVE_REFRESH, onDone: onClose,
  });
  return <Modal title="Dán danh sách nhiệm vụ" open={open} onCancel={onClose} onOk={() => form.submit()} okText={lines.length ? `Thêm ${lines.length} nhiệm vụ` : 'Thêm nhiệm vụ'} cancelText="Hủy" confirmLoading={save.isPending} width={760} destroyOnHidden>
    <Form form={form} layout="vertical" className="form-grid" onFinish={values => save.mutate(values)}>
      <Form.Item name="departmentId" label="Phòng chủ trì" rules={required}><Select showSearch={{ optionFilterProp: 'label' }} options={options.departments.map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
      <Form.Item name="dueDate" label="Hạn chung" tooltip="Áp dụng cho dòng chưa ghi hạn ở cuối"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="text" label="Danh sách" className="span-2" rules={required} extra="Mỗi dòng một nhiệm vụ; có thể ghi hạn cuối dòng: trước 30/11/2026.">
        <Input.TextArea rows={8} maxLength={50000} placeholder={'Rà soát hồ sơ giải ngân trước 30/11/2026\nTổng hợp kết quả kiểm tra trật tự đô thị trước 15/12/2026'} />
      </Form.Item>
    </Form>
    {lines.length > 0 && <><Typography.Text strong>{lines.length} nhiệm vụ</Typography.Text><ol className="directive-paste-preview">{lines.slice(0, 100).map((line: string, index: number) => <li key={index}>{line}</li>)}</ol></>}
  </Modal>;
}

export function BulkTasks({ open, directive, options, tasks, onClose }: { open: boolean; directive: DirectiveDetail; options: DirectiveOptions; tasks: DirectiveTask[]; onClose: () => void }) {
  const [form] = Form.useForm<{ departmentId?: string; dueDate?: Dayjs }>();
  useEffect(() => { if (open) form.resetFields(); }, [open, form]);
  const save = useAction((values: { departmentId?: string; dueDate?: Dayjs }) => http.post(`/directives/${directive.id}/bulk`, { tasks: tasks.map(task => ({ id: task.id, expectedVersion: task.version })), departmentId: values.departmentId, dueDate: values.dueDate?.format('YYYY-MM-DD') }), { success: 'Đã cập nhật nhiệm vụ đã chọn', refresh: DIRECTIVE_REFRESH, onDone: onClose });
  return <Modal title={`Giao ${tasks.length} nhiệm vụ`} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Áp dụng" cancelText="Hủy" confirmLoading={save.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={values => save.mutate(values)}>
      <Form.Item name="departmentId" label="Phòng chủ trì" rules={[{ validator: (_, value) => value || form.getFieldValue('dueDate') ? Promise.resolve() : Promise.reject(new Error('Chọn phòng hoặc hạn hoàn thành')) }]}><Select allowClear showSearch={{ optionFilterProp: 'label' }} options={options.departments.map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
      <Form.Item name="dueDate" label="Hạn hoàn thành"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
      <Alert type="info" showIcon title="Chỉ áp dụng trường đã chọn" />
    </Form>
  </Modal>;
}
