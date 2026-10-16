import { Checkbox, Collapse, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useRef } from 'react';
import { useMe } from '@/app/session';
import { useAction } from '@/hooks/useApi';
import { departmentOptions, frameworkOptions, useDepartments, useFrameworks } from '@/hooks/useRefs';
import { http } from '@/lib/api';
import { currentYear } from '@/lib/format';
import { frequencyLabel } from '@/lib/periods';
import { isGlobal } from '@/lib/roles';
import type { Target } from '@/types/core';
import type { FrameworkKind, Frequency } from '@/types/domain';

type Values = {
  title: string;
  description?: string;
  frameworkId?: string;
  kind: FrameworkKind;
  departmentId: string;
  coordinatorDepartmentIds?: string[];
  unit: string;
  targetValue: number;
  targetText?: string;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  frequency: Frequency;
  year: number;
  dueDate: Dayjs;
  weight: number;
  standardCode?: string;
  groupName?: string;
  isHighlighted?: boolean;
  publicOrder?: number;
};

export const KIND_OPTIONS = [
  { value: 'PLAN', label: 'Kế hoạch – thực hiện' },
  { value: 'SCORE', label: 'Chấm điểm' },
  { value: 'TASK', label: 'Nhiệm vụ' },
  { value: 'STAT', label: 'Thống kê' },
];

export const FREQUENCY_OPTIONS = (Object.keys(frequencyLabel) as Frequency[]).map(key => ({ value: key, label: frequencyLabel[key] }));

export const DIRECTION_OPTIONS = [
  { value: 'HIGHER_IS_BETTER', label: 'Càng cao càng tốt' },
  { value: 'LOWER_IS_BETTER', label: 'Càng thấp càng tốt' },
];

/** Thêm hoặc sửa chỉ tiêu. Khi sửa chỉ gửi các trường máy chủ cho phép đổi. */
export function TargetForm({ open, target, defaults, onClose, onSaved }: { open: boolean; target?: Target | null; defaults?: { year?: number; departmentId?: string; frameworkId?: string }; onClose: () => void; onSaved?: (target: Target) => void }) {
  const user = useMe();
  const [form] = Form.useForm<Values>();
  const departments = useDepartments();
  const frameworks = useFrameworks();
  const editing = Boolean(target);
  const year = Form.useWatch('year', form);
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      initialized.current = null;
      return;
    }
    const key = target?.id ?? 'new';
    if (initialized.current === key) return;
    initialized.current = key;
    form.resetFields();
    if (target) {
      form.setFieldsValue({
        title: target.title,
        description: target.description ?? '',
        frameworkId: target.frameworkId ?? undefined,
        kind: target.kind ?? 'PLAN',
        departmentId: target.department.id,
        coordinatorDepartmentIds: target.coordinators?.map(item => item.department.id) ?? [],
        unit: target.unit,
        targetValue: target.targetValue,
        targetText: target.targetText ?? '',
        direction: target.direction,
        frequency: target.frequency,
        year: target.year,
        dueDate: dayjs(target.dueDate),
        weight: target.weight,
        standardCode: target.standardCode ?? '',
        groupName: target.groupName ?? '',
        isHighlighted: target.isHighlighted,
        publicOrder: target.publicOrder ?? 0,
      });
    } else {
      const y = defaults?.year ?? currentYear();
      form.setFieldsValue({
        kind: frameworks.data?.find(item => item.id === defaults?.frameworkId)?.kind ?? 'PLAN',
        unit: '%',
        targetValue: 100,
        direction: 'HIGHER_IS_BETTER',
        frequency: 'YEARLY',
        year: y,
        dueDate: dayjs(`${y}-12-31`),
        weight: 1,
        departmentId: defaults?.departmentId ?? (isGlobal(user) ? undefined : user.departmentId ?? undefined),
        frameworkId: defaults?.frameworkId,
        publicOrder: 0,
      });
    }
  }, [open, target, defaults, form, user, frameworks.data]);

  const save = useAction(
    async (values: Values) => {
      const common = {
        title: values.title.trim(),
        description: values.description?.trim() ?? '',
        unit: values.unit.trim(),
        targetValue: values.targetValue,
        weight: values.weight,
        frequency: values.frequency,
        direction: values.direction,
        dueDate: values.dueDate.format('YYYY-MM-DD'),
        isHighlighted: Boolean(values.isHighlighted),
        publicOrder: values.publicOrder ?? 0,
      };
      if (target) {
        return http.patch<Target>(`/targets/${target.id}`, { ...common, expectedVersion: target.version, expectedPublicationVersion: target.publicationVersion });
      }
      return http.post<Target>('/targets', {
        ...common,
        year: values.year,
        departmentId: values.departmentId,
        kind: values.kind,
        ...(values.frameworkId ? { frameworkId: values.frameworkId } : {}),
        ...(values.targetText?.trim() ? { targetText: values.targetText.trim() } : {}),
        ...(values.standardCode?.trim() ? { standardCode: values.standardCode.trim() } : {}),
        ...(values.groupName?.trim() ? { groupName: values.groupName.trim() } : {}),
        ...(values.coordinatorDepartmentIds?.length ? { coordinatorDepartmentIds: values.coordinatorDepartmentIds } : {}),
      });
    },
    {
      success: result => (target ? `Đã cập nhật ${result.code ?? target.code}` : `Đã tạo chỉ tiêu ${result.code}`),
      refresh: ['/targets', '/ioc', '/frameworks', '/my-work'],
      onDone: result => {
        onSaved?.(result);
        onClose();
      },
    },
  );

  const departmentId = Form.useWatch('departmentId', form);

  return (
    <Modal
      title={editing ? `Sửa chỉ tiêu ${target?.code}` : 'Thêm chỉ tiêu'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Lưu' : 'Tạo chỉ tiêu'}
      confirmLoading={save.isPending}
      width={760}
      destroyOnHidden
      mask={{ closable: false }}
    >
      <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} className="form-grid">
        <Form.Item name="title" label="Tên chỉ tiêu" className="span-2" rules={[{ required: true, min: 3, max: 300, message: 'Nhập tên chỉ tiêu (3–300 ký tự)' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Mô tả" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
        </Form.Item>
        <Form.Item name="frameworkId" label="Bộ chỉ tiêu">
          <Select
            allowClear
            disabled={editing}
            options={frameworkOptions(frameworks.data)}
            placeholder="Không thuộc bộ nào"
            showSearch={{ optionFilterProp: 'label' }}
            onChange={value => {
              const framework = frameworks.data?.find(item => item.id === value);
              if (framework) form.setFieldValue('kind', framework.kind);
            }}
          />
        </Form.Item>
        <Form.Item name="kind" label="Loại" rules={[{ required: true }]}>
          <Select disabled={editing} options={KIND_OPTIONS} />
        </Form.Item>
        <Form.Item name="departmentId" label="Phòng chủ trì" rules={[{ required: true, message: 'Chọn phòng chủ trì' }]}>
          <Select disabled={editing || !isGlobal(user)} options={departmentOptions(departments.data)} showSearch={{ optionFilterProp: 'label' }} />
        </Form.Item>
        <Form.Item name="coordinatorDepartmentIds" label="Phòng phối hợp">
          <Select mode="multiple" disabled={editing} maxCount={10} options={departmentOptions(departments.data).filter(item => item.value !== departmentId)} showSearch={{ optionFilterProp: 'label' }} />
        </Form.Item>
        <Form.Item name="targetValue" label="Giá trị kế hoạch" rules={[{ required: true, message: 'Nhập giá trị' }]}>
          <InputNumber min={0} style={{ width: '100%' }} decimalSeparator="," />
        </Form.Item>
        <Form.Item name="unit" label="Đơn vị tính" rules={[{ required: true, max: 50, message: 'Nhập đơn vị tính' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="targetText" label="Chỉ tiêu ghi bằng chữ">
          <Input disabled={editing} maxLength={300} placeholder="Ví dụ: Trên 95%" />
        </Form.Item>
        <Form.Item name="direction" label="Chiều đánh giá" rules={[{ required: true }]}>
          <Select options={DIRECTION_OPTIONS} />
        </Form.Item>
        <Form.Item name="frequency" label="Kỳ báo cáo" rules={[{ required: true }]}>
          <Select options={FREQUENCY_OPTIONS} />
        </Form.Item>
        <Form.Item name="year" label="Năm kế hoạch" rules={[{ required: true }]}>
          <InputNumber
            min={2000}
            max={2100}
            disabled={editing}
            style={{ width: '100%' }}
            onChange={value => {
              if (typeof value === 'number' && value >= 2000) form.setFieldValue('dueDate', dayjs(`${value}-12-31`));
            }}
          />
        </Form.Item>
        <Form.Item
          name="dueDate"
          label="Hạn hoàn thành"
          rules={[
            { required: true, message: 'Chọn hạn' },
            {
              validator: (_, value: Dayjs | undefined) =>
                !value || !year || value.year() === year ? Promise.resolve() : Promise.reject(new Error('Hạn phải thuộc năm kế hoạch')),
            },
          ]}
        >
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="weight" label="Trọng số" rules={[{ required: true }]}>
          <InputNumber min={0.1} max={10} step={0.1} style={{ width: '100%' }} decimalSeparator="," />
        </Form.Item>
        <Collapse
          ghost
          size="small"
          className="span-2 form-more"
          items={[
            {
              key: 'more',
              label: 'Mã, nhóm và hiển thị công khai',
              forceRender: true,
              children: (
                <div className="form-grid">
                  <Form.Item name="standardCode" label="Mã theo văn bản">
                    <Input disabled={editing} maxLength={40} />
                  </Form.Item>
                  <Form.Item name="groupName" label="Nhóm chỉ tiêu">
                    <Input disabled={editing} maxLength={160} />
                  </Form.Item>
                  <Form.Item name="publicOrder" label="Thứ tự trên trang công khai">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="isHighlighted" label=" " valuePropName="checked">
                    <Checkbox>Nổi bật trên trang công khai</Checkbox>
                  </Form.Item>
                </div>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
