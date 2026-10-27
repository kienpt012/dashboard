import { EditOutlined, PictureOutlined, SettingOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Markdown } from '@/components/Markdown';
import { deskApi } from '../api';
import { isInternalPath, isSafeUrl } from '../urls';
import { WidgetSkeleton } from '../WidgetFrame';
import { useSettings, useWidget } from './context';
import { Note } from './parts';

// Widget nội dung: khối chữ cố định (Markdown gọn) và ảnh đã tải lên (sơ đồ tổ chức, bản đồ…) có chú thích, liên kết.

export function TextBlock() {
  const { body = '', align = 'left' } = useSettings<{ body: string; align: 'left' | 'center' }>();
  const { openSettings } = useWidget();
  if (!body.trim()) {
    return (
      <Note
        icon={<EditOutlined />}
        action={
          <Button size="small" icon={<SettingOutlined />} onClick={openSettings}>
            Viết nội dung
          </Button>
        }
      >
        Số điện thoại, quy trình, lời nhắn cố định
      </Note>
    );
  }
  return <Markdown text={body} className={`cw-text${align === 'center' ? ' center' : ''}`} />;
}

/** Ảnh hiện ngay bản thu nhỏ rồi thay bằng bản đầy đủ khi tải xong; ảnh đã xoá hoặc mất quyền thì báo. */
function useAssetImage(assetId: string | null) {
  const [state, setState] = useState<{ id: string | null; src: string; full: boolean; missing: boolean }>({ id: null, src: '', full: false, missing: false });
  useEffect(() => {
    if (!assetId) return;
    let alive = true;
    setState({ id: assetId, src: '', full: false, missing: false });
    void deskApi.assetBlobUrl(assetId, 'thumb').then(src => {
      if (alive && src) setState(current => (current.full ? current : { id: assetId, src, full: false, missing: false }));
    });
    void deskApi.assetBlobUrl(assetId, 'full').then(src => {
      if (!alive) return;
      setState(current => (src ? { id: assetId, src, full: true, missing: false } : current.src ? current : { id: assetId, src: '', full: false, missing: true }));
    });
    return () => {
      alive = false;
    };
  }, [assetId]);
  return state.id === assetId ? state : { id: assetId, src: '', full: false, missing: false };
}

export function ImageBlock() {
  const { assetId = null, fit = 'cover', caption = '', link = null } = useSettings<{ assetId: string | null; fit: 'cover' | 'contain'; caption: string; link: string | null }>();
  const { openSettings } = useWidget();
  const navigate = useNavigate();
  const image = useAssetImage(assetId);

  if (!assetId || image.missing) {
    return (
      <Note
        icon={<PictureOutlined />}
        action={
          <Button size="small" icon={<SettingOutlined />} onClick={openSettings}>
            Chọn ảnh
          </Button>
        }
      >
        {image.missing ? 'Ảnh không còn hoặc bạn không xem được' : 'Sơ đồ tổ chức, bản đồ, ảnh đơn vị…'}
      </Note>
    );
  }
  if (!image.src) return <WidgetSkeleton />;

  const target = link && (isInternalPath(link) || isSafeUrl(link)) ? link : null;
  const open = () => {
    if (!target) return;
    if (isInternalPath(target)) navigate(target);
    else window.open(target, '_blank', 'noopener,noreferrer');
  };
  return (
    <figure className={`cw-image ${fit}${target ? ' linked' : ''}`} onClick={open} role={target ? 'link' : undefined} tabIndex={target ? 0 : undefined} onKeyDown={event => event.key === 'Enter' && open()}>
      <img src={image.src} alt={caption || 'Ảnh trên bàn làm việc'} className={image.full ? 'full' : 'thumb'} draggable={false} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
