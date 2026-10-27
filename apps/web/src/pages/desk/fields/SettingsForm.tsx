import { ColorPicker, Input, InputNumber, Segmented, Select, Space, Switch, Typography } from 'antd';
import type { ReactNode } from 'react';
import { LinksEditor } from '../dock/DockItemEditor';
import type { SettingField } from '../types';
import { isSafeUrl } from '../urls';
import { AssetField, DateTimeField, DepartmentField, ListField, ProviderField, SearchProvidersField, TargetField, TimezoneField } from './editors';

// Biểu mẫu cài đặt tự sinh từ khai báo trường của sổ widget. Mỗi thay đổi gọi onChange ngay (áp dụng tức thì, hoàn
// tác được); ô chữ và thanh số gộp các lần gõ liên tiếp thành một bước hoàn tác.

function hex(value: unknown) {
  return typeof value === 'string' ? value : ((value as { toHexString?: () => string })?.toHexString?.() ?? null);
}

function editor(field: SettingField, value: unknown, set: (value: unknown, coalesce?: boolean) => void, departmentId: string | null): ReactNode {
  switch (field.type) {
    case 'text':
      return <Input value={String(value ?? '')} maxLength={field.max} placeholder={field.placeholder} onChange={event => set(event.target.value, true)} />;
    case 'textarea':
      return <Input.TextArea value={String(value ?? '')} maxLength={field.max} autoSize={{ minRows: 4, maxRows: 14 }} onChange={event => set(event.target.value, true)} showCount />;
    case 'number': {
      const input = (
        <InputNumber
          value={typeof value === 'number' ? value : field.default}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={next => next !== null && set(next, true)}
          style={{ width: '100%' }}
        />
      );
      return field.unit ? (
        <Space.Compact block>
          {input}
          <Space.Addon>{field.unit}</Space.Addon>
        </Space.Compact>
      ) : (
        input
      );
    }
    case 'boolean':
      return <Switch checked={Boolean(value)} onChange={checked => set(checked)} />;
    case 'select':
      // Nút chọn liền hàng chỉ khi ít lựa chọn và nhãn ngắn; còn lại dùng ô chọn để nhãn không bị cắt.
      return field.options.length <= 3 && field.options.reduce((sum, option) => sum + option.label.length, 0) <= 24 ? (
        <Segmented block value={String(value ?? field.default)} onChange={set} options={field.options} />
      ) : (
        <Select value={value ?? field.default} onChange={next => set(next)} options={field.options} />
      );
    case 'multiselect':
      return <Select mode="multiple" value={(value as string[]) ?? []} onChange={next => set(next)} options={field.options} placeholder="Tất cả" maxCount={field.max} />;
    case 'color':
      return (
        <div className="bgp-colors">
          <button type="button" className={`bgp-swatch auto${value ? '' : ' selected'}`} onClick={() => set(null)}>
            Mặc định
          </button>
          <ColorPicker value={(value as string) ?? '#1d4ed8'} disabledAlpha size="small" onChangeComplete={next => set(hex(next))} />
        </div>
      );
    case 'department':
      return <DepartmentField value={(value as string | null) ?? null} onChange={set} />;
    case 'target':
      return <TargetField value={(value as string | null) ?? null} onChange={set} departmentId={departmentId} />;
    case 'targets':
      return <TargetField value={(value as string[]) ?? []} onChange={set} multiple max={field.max} departmentId={departmentId} />;
    case 'date':
      return <DateTimeField value={(value as string | null) ?? null} onChange={set} withTime={false} />;
    case 'datetime':
      return <DateTimeField value={(value as string | null) ?? null} onChange={set} withTime />;
    case 'url': {
      const text = String(value ?? '');
      return <Input value={text} status={text && !isSafeUrl(text) ? 'error' : undefined} placeholder="https://…" onChange={event => set(event.target.value || null, true)} />;
    }
    case 'asset':
      return <AssetField value={(value as string | null) ?? null} onChange={set} />;
    case 'links':
      return <LinksEditor value={(value as never) ?? []} onChange={set} max={field.max} allowFolder />;
    case 'list':
      return field.key === 'providerIds' ? (
        <ProviderField value={(value as string[]) ?? []} onChange={set} />
      ) : (
        <ListField value={(value as string[]) ?? []} onChange={next => set(next, true)} max={field.max} itemMax={field.itemMax} />
      );
    case 'searchProviders':
      return <SearchProvidersField value={(value as never) ?? []} onChange={next => set(next, true)} />;
    case 'timezones':
      return <TimezoneField value={(value as string[]) ?? []} onChange={set} max={field.max} />;
  }
}

export function SettingsForm({
  fields,
  values,
  onChange,
  departmentId,
}: {
  fields: SettingField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown, coalesce?: boolean) => void;
  departmentId: string | null;
}) {
  const visible = fields.filter(field => !field.showIf || values[field.showIf.key] === field.showIf.equals);
  if (!visible.length) return <Typography.Text type="secondary">Widget này không có cài đặt riêng.</Typography.Text>;
  return (
    <div className="settings-form">
      {visible.map(field => (
        <div className="bgp-row" key={field.key}>
          <div className="bgp-row-label">
            <span>{field.label}</span>
            {field.help && <Typography.Text type="secondary">{field.help}</Typography.Text>}
          </div>
          {editor(field, values[field.key], (value, coalesce) => onChange(field.key, value, coalesce), departmentId)}
        </div>
      ))}
    </div>
  );
}
