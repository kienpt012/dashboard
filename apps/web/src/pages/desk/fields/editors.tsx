import { DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Empty, Input, Select, Spin, Upload } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useMe } from '@/app/session';
import { invalidate, useApi } from '@/hooks/useApi';
import { errorText } from '@/lib/api';
import { currentYear } from '@/lib/format';
import { isGlobal } from '@/lib/roles';
import { deskApi } from '../api';
import { AssetThumb } from '../background/BackgroundPanel';
import type { AssetList, SearchProvider, TargetOption } from '../types';
import { useDesk } from '../useDesk';
import { isSafeUrl } from '../urls';

// Ô nhập cho từng kiểu trường cài đặt widget (fields/SettingsForm.tsx chọn ô theo kiểu khai báo ở sổ widget).

type Props<T> = { value?: T; onChange?: (value: T) => void };

export function DepartmentField({ value, onChange }: Props<string | null>) {
  const user = useMe();
  const desk = useDesk();
  if (!isGlobal(user)) return <Input value={user.department?.name ?? ''} disabled />;
  return (
    <Select
      value={value ?? '__focus__'}
      onChange={next => onChange?.(next === '__focus__' ? null : next)}
      showSearch
      optionFilterProp="title"
      options={[
        { value: '__focus__', title: 'Theo phòng đang xem', label: 'Theo phòng đang xem ở đầu bàn làm việc' },
        ...desk.focusDepartments.map(department => ({ value: department.id, title: department.name, label: department.name })),
      ]}
    />
  );
}

function useDebounced<T>(value: T, delay = 300) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return current;
}

/** Chọn một hoặc nhiều chỉ tiêu trong phòng (tìm theo mã hoặc tên). */
export function TargetField({ value, onChange, multiple, max, departmentId }: Props<string | string[] | null> & { multiple?: boolean; max?: number; departmentId: string | null }) {
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const selected = useMemo(() => (Array.isArray(value) ? value : value ? [value] : []), [value]);
  const options = useApi<TargetOption[]>(deskApi.targetsPath(departmentId, term, currentYear()), { keepPrevious: true });
  const known = useApi<TargetOption[]>(selected.length ? deskApi.targetsByIdsPath(selected) : null, { staleTime: 60_000 });
  const merged = useMemo(() => {
    const map = new Map<string, TargetOption>();
    for (const item of [...(known.data ?? []), ...(options.data ?? [])]) map.set(item.id, item);
    return [...map.values()];
  }, [known.data, options.data]);
  return (
    <Select
      mode={multiple ? 'multiple' : undefined}
      value={multiple ? selected : selected[0] ?? undefined}
      onChange={next => onChange?.(multiple ? ((next as string[]) ?? []).slice(0, max) : ((next as string) ?? null))}
      allowClear
      showSearch
      filterOption={false}
      onSearch={setSearch}
      notFoundContent={options.isFetching ? <Spin size="small" /> : 'Không thấy chỉ tiêu'}
      placeholder="Tìm theo mã hoặc tên chỉ tiêu"
      maxCount={multiple ? max : undefined}
      options={merged.map(item => ({ value: item.id, label: `${item.code} · ${item.title}` }))}
    />
  );
}

/** Chọn ảnh đã tải lên (của tôi hoặc của đơn vị), tải ảnh mới ngay tại chỗ. */
export function AssetField({ value, onChange }: Props<string | null>) {
  const client = useQueryClient();
  const { message } = App.useApp();
  const assets = useApi<AssetList>('/desk/assets');
  const [uploading, setUploading] = useState(false);
  const all = [...(assets.data?.mine ?? []), ...(assets.data?.shared ?? []).filter(item => !assets.data?.mine.some(mine => mine.id === item.id))];
  return (
    <div className="asset-field">
      <div className="bgp-grid">
        {all.map(asset => (
          <div key={asset.id} className={`bgp-tile${value === asset.id ? ' selected' : ''}`}>
            <button type="button" className="bgp-thumb" onClick={() => onChange?.(asset.id)} title={asset.name}>
              <AssetThumb id={asset.id} alt={asset.name} />
            </button>
            <span className="bgp-name">{asset.name}</span>
          </div>
        ))}
      </div>
      {!all.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ảnh" />}
      <Upload
        accept="image/jpeg,image/png,image/webp"
        showUploadList={false}
        beforeUpload={file => {
          setUploading(true);
          deskApi
            .uploadAsset(file)
            .then(async asset => {
              await invalidate(client, ['/desk/assets']);
              onChange?.(asset.id);
            })
            .catch(error => message.error(errorText(error, 'Không tải được ảnh lên')))
            .finally(() => setUploading(false));
          return false;
        }}
      >
        <Button icon={<UploadOutlined />} loading={uploading} style={{ marginTop: 8 }}>
          Tải ảnh lên
        </Button>
      </Upload>
    </div>
  );
}

/** Danh sách câu/chữ ngắn (câu hỏi soạn sẵn…). */
export function ListField({ value = [], onChange, max, itemMax, placeholder }: Props<string[]> & { max: number; itemMax: number; placeholder?: string }) {
  return (
    <div className="list-field">
      {value.map((item, index) => (
        <div key={index} className="list-field-row">
          <Input value={item} maxLength={itemMax} onChange={event => onChange?.(value.map((entry, i) => (i === index ? event.target.value : entry)))} />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(value.filter((_, i) => i !== index))} aria-label="Xoá dòng" />
        </div>
      ))}
      <Button icon={<PlusOutlined />} disabled={value.length >= max} onClick={() => onChange?.([...value, ''])} block>
        {placeholder ?? 'Thêm dòng'}
      </Button>
    </div>
  );
}

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Hà Nội, TP. Hồ Chí Minh' },
  { value: 'Asia/Bangkok', label: 'Băng Cốc' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Shanghai', label: 'Bắc Kinh' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Europe/London', label: 'Luân Đôn' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Moscow', label: 'Mát-xcơ-va' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
];

export const timezoneLabel = (zone: string) => TIMEZONES.find(item => item.value === zone)?.label ?? zone;

export function TimezoneField({ value = [], onChange, max }: Props<string[]> & { max: number }) {
  return <Select mode="multiple" value={value} onChange={onChange} maxCount={max} options={TIMEZONES} placeholder="Chọn giờ nơi khác" />;
}

/** Chọn trang tra cứu cho widget tìm kiếm (danh sách trang lấy từ cài đặt chung). */
export function ProviderField({ value = [], onChange }: Props<string[]>) {
  const desk = useDesk();
  return (
    <Select
      mode="multiple"
      value={value}
      onChange={onChange}
      placeholder="Mọi trang tra cứu"
      options={(desk.profile?.config.searchProviders ?? []).map(provider => ({ value: provider.id, label: provider.name }))}
    />
  );
}

/** Sửa danh sách trang tra cứu: tên + địa chỉ có {q} ở chỗ từ khoá. */
export function SearchProvidersField({ value = [], onChange }: Props<SearchProvider[]>) {
  return (
    <div className="list-field">
      {value.map((provider, index) => {
        const invalid = Boolean(provider.url) && (!provider.url.includes('{q}') || !isSafeUrl(provider.url.replace('{q}', 'x')));
        return (
          <div key={provider.id} className="list-field-row provider">
            <Input value={provider.name} maxLength={40} placeholder="Tên" onChange={event => onChange?.(value.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)))} style={{ width: 150 }} />
            <Input
              value={provider.url}
              status={invalid ? 'error' : undefined}
              placeholder="https://…?q={q}"
              onChange={event => onChange?.(value.map((entry, i) => (i === index ? { ...entry, url: event.target.value } : entry)))}
            />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(value.filter((_, i) => i !== index))} aria-label="Xoá trang tra cứu" />
          </div>
        );
      })}
      <Button icon={<PlusOutlined />} disabled={value.length >= 12} onClick={() => onChange?.([...value, { id: `s-${Date.now().toString(36)}`, name: '', url: '' }])} block>
        Thêm trang tra cứu
      </Button>
    </div>
  );
}

export function DateTimeField({ value, onChange, withTime }: Props<string | null> & { withTime: boolean }) {
  return (
    <DatePicker
      value={value ? dayjs(value) : null}
      showTime={withTime ? { format: 'HH:mm' } : false}
      format={withTime ? 'DD/MM/YYYY HH:mm' : 'DD/MM/YYYY'}
      onChange={next => onChange?.(next ? (withTime ? next.toISOString() : next.format('YYYY-MM-DD')) : null)}
      style={{ width: '100%' }}
    />
  );
}
