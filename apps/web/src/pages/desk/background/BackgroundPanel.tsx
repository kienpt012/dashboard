import { CheckOutlined, DeleteOutlined, PictureOutlined, ShareAltOutlined, UploadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, ColorPicker, Drawer, Empty, Flex, Input, Popconfirm, Radio, Segmented, Select, Slider, Switch, Tabs, Tooltip, Typography, Upload } from 'antd';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMe } from '@/app/session';
import { invalidate, useApi } from '@/hooks/useApi';
import { errorText } from '@/lib/api';
import { deskApi } from '../api';
import type { AssetList, AssetMeta, Background, DeskAppearance, DeskProfileConfig } from '../types';
import { useActiveSpace, useDesk } from '../useDesk';
import { daylightPhase } from './daylight';
import { PRESETS, PresetLayer } from './presets';
import './panel.css';

// Ngăn "Hình nền và giao diện": chọn nền (dựng sẵn, màu, dải màu, ảnh, trình chiếu), hiệu ứng thẻ, lời chào, trang
// mở đầu. Thay đổi áp dụng ngay, hoàn tác được, tự lưu.

const ACCENTS = ['#1d4ed8', '#0f766e', '#15803d', '#b45309', '#b42318', '#be185d', '#7c3aed', '#334155'];
const SOLIDS = ['#0f172a', '#1e293b', '#334155', '#475569', '#e2e8f0', '#f1f5f9', '#fef3c7', '#ecfccb', '#e0f2fe', '#ede9fe'];
const MINUTES = [1, 5, 15, 30, 60, 120, 240];
const MAX_UPLOAD = 10 * 1024 * 1024;

function hex(value: unknown) {
  if (typeof value === 'string') return value;
  return (value as { toHexString?: () => string })?.toHexString?.() ?? '#000000';
}

function sameBackground(a: Background, b: Background) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function AssetThumb({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    void deskApi.assetBlobUrl(id, 'thumb').then(value => alive && setUrl(value));
    return () => {
      alive = false;
    };
  }, [id]);
  return url ? <img src={url} alt={alt} draggable={false} /> : <PictureOutlined className="bgp-thumb-empty" />;
}

function Tile({ selected, title, onClick, children, extra }: { selected: boolean; title: string; onClick: () => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={`bgp-tile${selected ? ' selected' : ''}`}>
      <button type="button" className="bgp-thumb motion-off" onClick={onClick} aria-pressed={selected} title={title}>
        {children}
        {selected && (
          <span className="bgp-check">
            <CheckOutlined />
          </span>
        )}
      </button>
      <span className="bgp-name">{title}</span>
      {extra && <span className="bgp-extra">{extra}</span>}
    </div>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="bgp-row">
      <div className="bgp-row-label">
        <span>{label}</span>
        {hint && <Typography.Text type="secondary">{hint}</Typography.Text>}
      </div>
      {children}
    </div>
  );
}

export type PanelTab = 'background' | 'effects' | 'general';

export function BackgroundPanel({ open, onClose, tab = 'background' }: { open: boolean; onClose: () => void; tab?: PanelTab }) {
  const desk = useDesk();
  const space = useActiveSpace();
  const user = useMe();
  const client = useQueryClient();
  const { message } = App.useApp();
  const assets = useApi<AssetList>(open ? '/desk/assets' : null);
  const [scope, setScope] = useState<'all' | 'space'>(space?.config.background ? 'space' : 'all');
  const [slideshow, setSlideshow] = useState<Background[] | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [shuffle, setShuffle] = useState(false);
  const [gradient, setGradient] = useState<string[]>(['#1d4ed8', '#7c3aed']);
  const [angle, setAngle] = useState(135);
  const [uploading, setUploading] = useState(false);
  const profile = desk.profile?.config;
  const store = desk.store;

  useEffect(() => {
    if (open) setScope(space?.config.background ? 'space' : 'all');
  }, [open, space?.id, space?.config.background]);

  const current: Background = (scope === 'space' ? space?.config.background : null) ?? profile?.appearance.background ?? { kind: 'daylight' };
  const phase = useMemo(() => daylightPhase(new Date()).id, []);

  if (!profile) return null;

  const setBackground = (background: Background) => {
    if (scope === 'space' && space) store.updateSpace(space.id, config => ({ ...config, background }));
    else store.updateProfile(config => ({ ...config, appearance: { ...config.appearance, background } }));
  };
  const setAppearance = (patch: Partial<DeskAppearance>, coalesce?: string) =>
    store.updateProfile(config => ({ ...config, appearance: { ...config.appearance, ...patch } }), { coalesce });
  const setProfile = (patch: Partial<DeskProfileConfig>, coalesce?: string) => store.updateProfile(config => ({ ...config, ...patch }), { coalesce });

  const pick = (background: Background) => {
    if (!slideshow) return setBackground(background);
    setSlideshow(list => {
      const items = list ?? [];
      return items.some(item => sameBackground(item, background)) ? items.filter(item => !sameBackground(item, background)) : [...items, background].slice(0, 12);
    });
  };
  const isSelected = (background: Background) =>
    slideshow ? slideshow.some(item => sameBackground(item, background)) : current.kind === 'slideshow' ? current.items.some(item => sameBackground(item, background)) : sameBackground(current, background);

  async function upload(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return message.error('Chỉ nhận ảnh JPEG, PNG hoặc WebP');
    if (file.size > MAX_UPLOAD) return message.error('Ảnh tối đa 10 MB');
    setUploading(true);
    try {
      const asset = await deskApi.uploadAsset(file);
      await invalidate(client, ['/desk/assets']);
      pick({ kind: 'image', assetId: asset.id, fit: 'cover', focus: { x: 50, y: 50 } });
      message.success('Đã tải ảnh lên');
    } catch (error) {
      message.error(errorText(error, 'Không tải được ảnh lên'));
    } finally {
      setUploading(false);
    }
  }

  async function removeAsset(asset: AssetMeta) {
    try {
      await deskApi.deleteAsset(asset.id);
      await invalidate(client, ['/desk/assets']);
      if (current.kind === 'image' && current.assetId === asset.id) setBackground({ kind: 'daylight' });
    } catch (error) {
      message.error(errorText(error, 'Không xoá được ảnh'));
    }
  }

  async function toggleShared(asset: AssetMeta) {
    try {
      await deskApi.updateAsset(asset.id, { isShared: !asset.isShared });
      await invalidate(client, ['/desk/assets']);
      message.success(asset.isShared ? 'Đã thôi dùng chung ảnh' : 'Ảnh đã thành ảnh dùng chung của đơn vị');
    } catch (error) {
      message.error(errorText(error, 'Không đổi được chế độ dùng chung'));
    }
  }

  const image = (asset: AssetMeta) => ({ kind: 'image', assetId: asset.id, fit: 'cover', focus: { x: 50, y: 50 } }) as Background;
  const used = assets.data ? `${(assets.data.usedBytes / 1024 / 1024).toFixed(1)}/${Math.round(assets.data.limitBytes / 1024 / 1024)} MB` : '';

  const backgroundTab = (
    <div className="bgp">
      <Flex justify="space-between" align="center" wrap gap={8} className="bgp-scope">
        <Segmented
          value={scope}
          onChange={value => setScope(value as 'all' | 'space')}
          options={[
            { value: 'all', label: 'Mọi không gian' },
            { value: 'space', label: `Chỉ “${space?.name ?? ''}”` },
          ]}
        />
        {scope === 'space' && space?.config.background && (
          <Button size="small" onClick={() => space && store.updateSpace(space.id, config => ({ ...config, background: null }))}>
            Dùng nền chung
          </Button>
        )}
      </Flex>

      <Flex justify="space-between" align="center" className="bgp-head">
        <Typography.Text strong>{slideshow ? `Chọn ảnh cho trình chiếu (${slideshow.length})` : 'Bộ sưu tập'}</Typography.Text>
        <Switch
          size="small"
          checked={Boolean(slideshow)}
          onChange={on => setSlideshow(on ? (current.kind === 'slideshow' ? current.items : []) : null)}
          checkedChildren="Trình chiếu"
          unCheckedChildren="Trình chiếu"
        />
      </Flex>
      <div className="bgp-grid">
        {!slideshow && (
          <Tile selected={current.kind === 'daylight'} title="Theo giờ trong ngày" onClick={() => setBackground({ kind: 'daylight' })}>
            <PresetLayer id={phase === 'dawn' ? 'binh-minh' : phase === 'day' ? 'trua' : phase === 'dusk' ? 'hoang-hon' : 'dem-sao'} />
            <span className="bgp-badge">Tự đổi</span>
          </Tile>
        )}
        {PRESETS.map(preset => (
          <Tile key={preset.id} selected={isSelected({ kind: 'preset', id: preset.id })} title={preset.name} onClick={() => pick({ kind: 'preset', id: preset.id })}>
            <PresetLayer id={preset.id} />
          </Tile>
        ))}
      </div>

      {slideshow && (
        <div className="bgp-slideshow">
          <Flex gap={8} align="center" wrap>
            <span>Đổi ảnh sau</span>
            <Select size="small" value={minutes} onChange={setMinutes} options={MINUTES.map(value => ({ value, label: value < 60 ? `${value} phút` : `${value / 60} giờ` }))} style={{ width: 110 }} />
            <Switch size="small" checked={shuffle} onChange={setShuffle} /> <span>Ngẫu nhiên</span>
          </Flex>
          <Button
            type="primary"
            disabled={slideshow.length < 2}
            onClick={() => {
              setBackground({ kind: 'slideshow', items: slideshow, minutes, shuffle });
              setSlideshow(null);
            }}
          >
            Áp dụng trình chiếu ({slideshow.length} ảnh)
          </Button>
        </div>
      )}

      <Typography.Text strong className="bgp-section">
        Màu và dải màu
      </Typography.Text>
      <div className="bgp-colors">
        {SOLIDS.map(color => (
          <button
            key={color}
            type="button"
            className={`bgp-swatch${current.kind === 'color' && current.color === color ? ' selected' : ''}`}
            style={{ background: color }}
            onClick={() => pick({ kind: 'color', color })}
            aria-label={`Nền màu ${color}`}
          />
        ))}
        <ColorPicker
          value={current.kind === 'color' ? current.color : '#1e293b'}
          onChangeComplete={value => pick({ kind: 'color', color: hex(value) })}
          disabledAlpha
          showText={() => 'Màu khác'}
          size="small"
        />
      </div>
      <Flex gap={8} align="center" wrap className="bgp-gradient">
        {gradient.map((stop, index) => (
          <ColorPicker key={index} value={stop} disabledAlpha size="small" onChangeComplete={value => setGradient(list => list.map((item, i) => (i === index ? hex(value) : item)))} />
        ))}
        {gradient.length < 3 ? (
          <Button size="small" onClick={() => setGradient(list => [...list, '#f59e0b'])}>
            Thêm màu
          </Button>
        ) : (
          <Button size="small" onClick={() => setGradient(list => list.slice(0, 2))}>
            Bớt màu
          </Button>
        )}
        <Slider min={0} max={360} value={angle} onChange={setAngle} style={{ width: 120 }} tooltip={{ formatter: value => `${value}°` }} />
        <button type="button" className="bgp-gradient-preview" style={{ background: `linear-gradient(${angle}deg, ${gradient.join(', ')})` }} onClick={() => pick({ kind: 'gradient', stops: gradient, angle })}>
          Dùng dải màu này
        </button>
      </Flex>

      <Flex justify="space-between" align="center" className="bgp-head">
        <Typography.Text strong>Ảnh của tôi</Typography.Text>
        <Flex gap={8} align="center">
          {used && <Typography.Text type="secondary">{used}</Typography.Text>}
          <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={file => (void upload(file), false)}>
            <Button size="small" icon={<UploadOutlined />} loading={uploading}>
              Tải ảnh lên
            </Button>
          </Upload>
        </Flex>
      </Flex>
      {assets.data?.mine.length ? (
        <div className="bgp-grid">
          {assets.data.mine.map(asset => (
            <Tile
              key={asset.id}
              selected={isSelected(image(asset))}
              title={asset.name}
              onClick={() => pick(image(asset))}
              extra={
                <>
                  {user.role === 'ADMIN' && (
                    <Tooltip title={asset.isShared ? 'Thôi dùng chung' : 'Dùng chung cho cả đơn vị'}>
                      <Button size="small" type={asset.isShared ? 'primary' : 'text'} icon={<ShareAltOutlined />} onClick={() => void toggleShared(asset)} aria-label="Dùng chung" />
                    </Tooltip>
                  )}
                  <Popconfirm title="Xoá ảnh này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => void removeAsset(asset)}>
                    <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Xoá ảnh" />
                  </Popconfirm>
                </>
              }
            >
              <AssetThumb id={asset.id} alt={asset.name} />
            </Tile>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ảnh — ảnh tải lên được thu gọn và xoá thông tin vị trí trong ảnh" />
      )}

      {Boolean(assets.data?.shared.length) && (
        <>
          <Typography.Text strong className="bgp-section">
            Ảnh của đơn vị
          </Typography.Text>
          <div className="bgp-grid">
            {assets.data!.shared.map(asset => (
              <Tile key={asset.id} selected={isSelected(image(asset))} title={asset.name} onClick={() => pick(image(asset))}>
                <AssetThumb id={asset.id} alt={asset.name} />
              </Tile>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const appearance = profile.appearance;
  const effectsTab = (
    <div className="bgp">
      <Row label="Làm tối nền" hint="Giúp chữ dễ đọc trên ảnh sáng">
        <Slider min={0} max={80} value={appearance.dim} onChange={value => setAppearance({ dim: value }, 'dim')} tooltip={{ formatter: value => `${value}%` }} />
      </Row>
      <Row label="Làm mờ nền">
        <Slider min={0} max={24} value={appearance.blur} onChange={value => setAppearance({ blur: value }, 'blur')} tooltip={{ formatter: value => `${value}px` }} />
      </Row>
      <Row label="Kiểu thẻ widget">
        <Segmented
          block
          value={appearance.surface}
          onChange={value => setAppearance({ surface: value as DeskAppearance['surface'] })}
          options={[
            { value: 'glass', label: 'Kính mờ' },
            { value: 'solid', label: 'Nền đặc' },
            { value: 'outline', label: 'Chỉ viền' },
          ]}
        />
      </Row>
      {appearance.surface === 'glass' && (
        <Row label="Độ đặc của kính">
          <Slider min={40} max={100} value={appearance.surfaceOpacity} onChange={value => setAppearance({ surfaceOpacity: value }, 'surfaceOpacity')} tooltip={{ formatter: value => `${value}%` }} />
        </Row>
      )}
      <Row label="Màu nhấn" hint="Nút, liên kết, biểu tượng widget">
        <div className="bgp-colors">
          <button type="button" className={`bgp-swatch auto${appearance.accent === null ? ' selected' : ''}`} onClick={() => setAppearance({ accent: null })} title="Màu của đơn vị">
            Đơn vị
          </button>
          {ACCENTS.map(color => (
            <button key={color} type="button" className={`bgp-swatch${appearance.accent === color ? ' selected' : ''}`} style={{ background: color }} onClick={() => setAppearance({ accent: color })} aria-label={`Màu nhấn ${color}`} />
          ))}
          <ColorPicker value={appearance.accent ?? '#1d4ed8'} disabledAlpha size="small" onChangeComplete={value => setAppearance({ accent: hex(value) })} />
        </div>
      </Row>
      <Row label="Mật độ">
        <Segmented
          block
          value={appearance.density}
          onChange={value => setAppearance({ density: value as DeskAppearance['density'] })}
          options={[
            { value: 'comfortable', label: 'Thoáng' },
            { value: 'compact', label: 'Gọn' },
          ]}
        />
      </Row>
      <Row label="Cỡ chữ trong widget">
        <Slider min={90} max={125} step={5} value={appearance.fontScale} onChange={value => setAppearance({ fontScale: value }, 'fontScale')} tooltip={{ formatter: value => `${value}%` }} />
      </Row>
      <Row label="Bo góc">
        <Slider min={4} max={20} value={appearance.radius} onChange={value => setAppearance({ radius: value }, 'radius')} tooltip={{ formatter: value => `${value}px` }} />
      </Row>
      <Row label="Chuyển động của nền">
        <Segmented
          block
          value={appearance.motion}
          onChange={value => setAppearance({ motion: value as DeskAppearance['motion'] })}
          options={[
            { value: 'auto', label: 'Theo máy' },
            { value: 'full', label: 'Bật' },
            { value: 'reduced', label: 'Tắt' },
          ]}
        />
      </Row>
    </div>
  );

  const generalTab = (
    <div className="bgp">
      <Row label="Lời chào">
        <Flex vertical gap={10}>
          <Flex gap={8} align="center">
            <Switch size="small" checked={profile.greeting.show} onChange={show => setProfile({ greeting: { ...profile.greeting, show } })} /> Hiện lời chào và ngày tháng
          </Flex>
          <Input
            placeholder={`Tên gọi (mặc định: ${user.fullName})`}
            maxLength={40}
            value={profile.greeting.name ?? ''}
            onChange={event => setProfile({ greeting: { ...profile.greeting, name: event.target.value || null } }, 'greeting.name')}
          />
          <Flex gap={8} align="center">
            <Switch size="small" checked={profile.greeting.lunar} onChange={lunar => setProfile({ greeting: { ...profile.greeting, lunar } })} /> Ngày âm lịch
          </Flex>
          <Flex gap={8} align="center">
            <Switch size="small" checked={profile.greeting.holidays} onChange={holidays => setProfile({ greeting: { ...profile.greeting, holidays } })} /> Ngày lễ, ngày kỷ niệm
          </Flex>
        </Flex>
      </Row>
      <Row label="Dock lối tắt" hint="Chuột phải một biểu tượng trên dock để sửa, chuyển vào thư mục hoặc gỡ">
        <Flex vertical gap={10}>
          <Segmented
            block
            value={profile.dock.position}
            onChange={value => setProfile({ dock: { ...profile.dock, position: value as DeskProfileConfig['dock']['position'] } })}
            options={[
              { value: 'bottom', label: 'Dưới' },
              { value: 'left', label: 'Trái' },
              { value: 'right', label: 'Phải' },
              { value: 'hidden', label: 'Ẩn' },
            ]}
          />
          <Flex gap={8} align="center">
            <Switch size="small" checked={profile.dock.autoHide} disabled={profile.dock.position === 'hidden'} onChange={autoHide => setProfile({ dock: { ...profile.dock, autoHide } })} /> Tự ẩn, hiện khi đưa chuột tới mép
          </Flex>
          <Flex gap={8} align="center">
            <Switch size="small" checked={profile.dock.magnify} disabled={profile.dock.position === 'hidden'} onChange={magnify => setProfile({ dock: { ...profile.dock, magnify } })} /> Phóng to biểu tượng khi rê chuột
          </Flex>
        </Flex>
      </Row>
      <Row label="Trang mở đầu" hint="Trang mở ra ngay sau khi đăng nhập">
        <Radio.Group
          value={profile.startPage}
          onChange={event => setProfile({ startPage: event.target.value })}
          options={[
            { value: 'desk', label: 'Bàn làm việc' },
            { value: 'ops', label: 'Trung tâm điều hành' },
            { value: 'work', label: 'Việc của tôi' },
          ]}
        />
      </Row>
      <Row label="Khôi phục" hint="Đưa bàn làm việc về mẫu ban đầu của vai trò; sổ ghi chú và việc riêng trong widget bị xoá">
        <Popconfirm title="Khôi phục bàn làm việc mẫu?" description="Mọi không gian và widget hiện tại sẽ được thay bằng mẫu." okText="Khôi phục" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => void store.reset().then(onClose)}>
          <Button danger>Khôi phục bàn làm việc mẫu</Button>
        </Popconfirm>
      </Row>
    </div>
  );

  return (
    <Drawer title="Hình nền và giao diện" open={open} onClose={onClose} size={460} className="bgp-drawer" mask={false} destroyOnHidden>
      <Tabs
        key={tab}
        defaultActiveKey={tab}
        items={[
          { key: 'background', label: 'Hình nền', children: backgroundTab },
          { key: 'effects', label: 'Hiệu ứng', children: effectsTab },
          { key: 'general', label: 'Chung', children: generalTab },
        ]}
      />
    </Drawer>
  );
}
