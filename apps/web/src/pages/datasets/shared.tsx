import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Flex, Form, Input, Modal, Select, Table, Upload, type UploadFile } from 'antd';
import { useEffect, useState } from 'react';
import { ScrollBox } from '@/components/Scroll';
import { useAction } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { errorText, http } from '@/lib/api';
import { date, num } from '@/lib/format';
import type { Dataset, DatasetColumn } from '@/types/domain';

export type DatasetDetail = Dataset & { id?: string; version?: number; ownerDepartmentId?: string | null };
export type Recomputed = { targetId: string; code: string; title: string; previousValue: number; value: number | null; changed: boolean; warnings: string[] };
export type ImportResult = { applied: boolean; total: number; valid: number; errors: { line: number; errors: string[] }[]; sample: Record<string, unknown>[]; recomputed?: Recomputed[] };

export const TYPE_LABEL: Record<DatasetColumn['type'], string> = { text: 'Chữ', number: 'Số', date: 'Ngày', boolean: 'Có/không', enum: 'Danh mục' };

export function cellText(column: DatasetColumn, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'number' && typeof value === 'number') return num(value);
  if (column.type === 'date' && typeof value === 'string') return date(value);
  if (column.type === 'boolean') return value === true ? 'Có' : value === false ? 'Không' : String(value);
  return String(value);
}

/** Báo các chỉ tiêu tự tính vừa thay đổi sau khi ghi dữ liệu. */
export function useRecomputedNotice() {
  const { notification } = App.useApp();
  return (recomputed?: Recomputed[]) => {
    const changed = (recomputed ?? []).filter(item => item.changed);
    if (!changed.length) return;
    notification.info({
      message: `Đã tính lại ${changed.length} chỉ tiêu`,
      description: changed
        .slice(0, 5)
        .map(item => `${item.code}: ${item.value === null ? 'chưa tính được' : num(item.value)}`)
        .join('\n'),
      style: { whiteSpace: 'pre-line' },
    });
  };
}

type ColumnDraft = { key: string; label: string; type: DatasetColumn['type']; required: boolean; options?: string };

export function DatasetForm({ open, item, onClose, onSaved }: { open: boolean; item?: DatasetDetail | null; onClose: () => void; onSaved?: (code: string) => void }) {
  const [form] = Form.useForm();
  const departments = useDepartments();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      item
        ? {
            code: item.code,
            name: item.name,
            description: item.description ?? '',
            ownerDepartmentId: item.ownerDepartment?.id ?? undefined,
            updateCycle: item.updateCycle ?? '',
            sourceSystem: item.sourceSystem ?? '',
            collectionGuide: item.collectionGuide ?? '',
            columns: item.columns.map(column => ({ ...column, required: Boolean(column.required), options: (column.options ?? []).join(', ') })),
          }
        : { columns: [{ key: '', label: '', type: 'text', required: true }] },
    );
  }, [open, item, form]);

  const save = useAction(
    async (values: { code: string; name: string; description?: string; ownerDepartmentId?: string; updateCycle?: string; sourceSystem?: string; collectionGuide?: string; columns: ColumnDraft[] }) => {
      // Khi sửa, gửi chuỗi rỗng để xoá được giá trị cũ; khi tạo thì bỏ trường trống.
      const optional = (value?: string) => value?.trim() || (item ? '' : undefined);
      const body = {
        name: values.name.trim(),
        description: optional(values.description),
        ownerDepartmentId: values.ownerDepartmentId || undefined,
        updateCycle: optional(values.updateCycle),
        sourceSystem: optional(values.sourceSystem),
        collectionGuide: optional(values.collectionGuide),
        columns: values.columns.map(column => ({
          key: column.key,
          label: column.label.trim(),
          type: column.type,
          required: Boolean(column.required),
          ...(column.type === 'enum' ? { options: (column.options ?? '').split(',').map(value => value.trim()).filter(Boolean) } : {}),
        })),
      };
      if (item) await http.patch(`/datasets/${encodeURIComponent(item.code)}`, { ...body, expectedVersion: item.version });
      else await http.post('/datasets', { ...body, code: values.code });
      return item?.code ?? values.code;
    },
    {
      success: item ? 'Đã cập nhật bảng dữ liệu' : 'Đã tạo bảng dữ liệu',
      refresh: ['/datasets'],
      onDone: code => {
        onSaved?.(code);
        onClose();
      },
    },
  );

  return (
    <Modal title={item ? 'Sửa bảng dữ liệu' : 'Tạo bảng dữ liệu'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={save.isPending} width={900} destroyOnHidden mask={{ closable: false }}>
      <Form form={form} layout="vertical" onFinish={values => save.mutate(values)}>
        <div className="form-grid">
          <Form.Item name="code" label="Mã bảng" rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{2,47}$/, message: 'Chữ thường không dấu, số, gạch dưới; 3–48 ký tự' }]}>
            <Input disabled={Boolean(item)} placeholder="ho_so_dat_dai" />
          </Form.Item>
          <Form.Item name="name" label="Tên bảng" rules={[{ required: true, min: 3, max: 160, message: '3–160 ký tự' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="ownerDepartmentId" label="Phòng quản lý">
            <Select allowClear={!item} options={departmentOptions(departments.data)} />
          </Form.Item>
          <Form.Item name="updateCycle" label="Chu kỳ cập nhật">
            <Input placeholder="Hằng tháng" maxLength={80} />
          </Form.Item>
          <Form.Item name="sourceSystem" label="Hệ thống nguồn" className="span-2">
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả" className="span-2">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
          </Form.Item>
          <Form.Item name="collectionGuide" label="Cách thu thập" className="span-2">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={2000} />
          </Form.Item>
        </div>
        <Form.List name="columns" rules={[{ validator: (_, value: unknown[]) => (value?.length && value.length <= 40 ? Promise.resolve() : Promise.reject(new Error('Từ 1 đến 40 cột'))) }]}>
          {(fields, { add, remove }, { errors }) => (
            <>
              <div className="columns-editor">
                <div className="columns-head">
                  <span>Mã cột</span>
                  <span>Nhãn</span>
                  <span>Kiểu</span>
                  <span>Giá trị danh mục</span>
                  <span>Bắt buộc</span>
                  <span />
                </div>
                {fields.map(field => (
                  <div className="columns-row" key={field.key}>
                    <Form.Item name={[field.name, 'key']} rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{0,39}$/, message: 'a-z, 0-9, _' }]}>
                      <Input placeholder="so_ho" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'label']} rules={[{ required: true, message: 'Nhập nhãn' }]}>
                      <Input placeholder="Số hộ" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'type']} initialValue="text">
                      <Select options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate>
                      {({ getFieldValue }) => (
                        <Form.Item name={[field.name, 'options']} rules={[{ required: getFieldValue(['columns', field.name, 'type']) === 'enum', message: 'Nhập giá trị, cách nhau dấu phẩy' }]}>
                          <Input disabled={getFieldValue(['columns', field.name, 'type']) !== 'enum'} placeholder="A, B, C" />
                        </Form.Item>
                      )}
                    </Form.Item>
                    <Form.Item name={[field.name, 'required']} valuePropName="checked" initialValue={false}>
                      <Checkbox />
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} disabled={fields.length <= 1} aria-label="Xoá cột" />
                  </div>
                ))}
              </div>
              <Button icon={<PlusOutlined />} onClick={() => add({ key: '', label: '', type: 'text', required: false })} disabled={fields.length >= 40}>
                Thêm cột
              </Button>
              <Form.ErrorList errors={errors} />
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

export function ImportModal({ dataset, open, onClose }: { dataset: DatasetDetail; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const notify = useRecomputedNotice();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const run = useAction(
    async (apply: boolean) => {
      const body = new FormData();
      body.set('file', file!);
      return http.post<ImportResult>(`/datasets/${encodeURIComponent(dataset.code)}/import${apply ? '?apply=true' : ''}`, body);
    },
    {
      refresh: ['/datasets', '/targets', '/ioc'],
      onDone: result => {
        if (result.applied) {
          message.success(`Đã nhập ${num(result.valid)} dòng`);
          notify(result.recomputed);
          onClose();
        } else setPreview(result);
      },
    },
  );

  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
    }
  }, [open]);

  const list: UploadFile[] = file ? [{ uid: '1', name: file.name, status: 'done' }] : [];

  return (
    <Modal
      title={`Nhập Excel vào «${dataset.name}»`}
      open={open}
      onCancel={onClose}
      width={640}
      destroyOnHidden
      footer={
        <Flex gap={8} justify="flex-end">
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            disabled={!file}
            loading={run.isPending && busy === 'check'}
            onClick={() => {
              setBusy('check');
              run.mutate(false);
            }}
          >
            Kiểm tra tệp
          </Button>
          <Button
            type="primary"
            disabled={!preview || preview.errors.length > 0 || !preview.valid}
            loading={run.isPending && busy === 'apply'}
            onClick={() => {
              setBusy('apply');
              run.mutate(true);
            }}
          >
            Nhập dữ liệu
          </Button>
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        <Upload.Dragger
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          maxCount={1}
          fileList={list}
          beforeUpload={value => {
            setFile(value);
            setPreview(null);
            return false;
          }}
          onRemove={() => {
            setFile(null);
            setPreview(null);
          }}
        >
          <p className="ant-upload-text">Kéo tệp Excel vào đây hoặc bấm để chọn</p>
          <p className="ant-upload-hint">Tệp theo mẫu của bảng (.xlsx)</p>
        </Upload.Dragger>
        {preview && (
          <Alert
            type={preview.errors.length ? 'warning' : 'success'}
            showIcon
            title={`${num(preview.valid)}/${num(preview.total)} dòng hợp lệ${preview.total - preview.valid ? ` · ${num(preview.total - preview.valid)} dòng lỗi` : ''}${preview.total - preview.valid > preview.errors.length ? ` (hiển thị ${preview.errors.length} lỗi đầu)` : ''}`}
            description={
              preview.errors.length > 0 && (
                <ScrollBox maxHeight={200}>
                <ul className="plain-list">
                  {preview.errors.map(item => (
                    <li key={item.line}>
                      Dòng {item.line}: {item.errors.join(' ')}
                    </li>
                  ))}
                </ul>
                </ScrollBox>
              )
            }
          />
        )}
        {preview && preview.sample.length > 0 && !preview.errors.length && (
          <Table
            size="small"
            rowKey={(_, index) => String(index)}
            pagination={false}
            scroll={{ x: true }}
            dataSource={preview.sample.slice(0, 5)}
            columns={dataset.columns.slice(0, 6).map(column => ({ title: column.label, key: column.key, render: (_: unknown, row: Record<string, unknown>) => cellText(column, row[column.key]) }))}
          />
        )}
      </Flex>
    </Modal>
  );
}

export function downloadTemplate(code: string, name: string, onError: (text: string) => void) {
  return http
    .blob(`/datasets/${encodeURIComponent(code)}/template.xlsx`)
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mau-${code}.xlsx`;
      link.title = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    })
    .catch(error => onError(errorText(error)));
}
