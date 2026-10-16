import { AudioMutedOutlined, AudioOutlined } from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { setJarvisSettings, useJarvisSettings } from './settings';
import { chime, voiceSupport } from './voice';

const HEARD_MS = 2600;

/** Nút bật/tắt gọi Jarvis bằng giọng nói trên thanh đầu trang, kèm bong bóng câu vừa nghe được. */
export function WakeToggle({ heard, quiet }: { heard: string; /** Khung Jarvis đang mở thì không hiện bong bóng. */ quiet: boolean }) {
  const { message } = App.useApp();
  const { wake } = useJarvisSettings();
  const [shown, setShown] = useState('');

  useEffect(() => {
    if (!heard) return;
    setShown(heard);
    const timer = window.setTimeout(() => setShown(''), HEARD_MS);
    return () => window.clearTimeout(timer);
  }, [heard]);

  const usable = voiceSupport.recognition && voiceSupport.secure;
  const tip = !voiceSupport.recognition
    ? 'Trình duyệt này chưa nhận dạng được giọng nói — dùng Chrome hoặc Edge'
    : !voiceSupport.secure
      ? 'Gọi bằng giọng nói cần truy cập qua HTTPS hoặc localhost'
      : wake
        ? 'Đang chờ gọi tên — nói “Jarvis ơi…”. Bấm để tắt'
        : 'Gọi Jarvis bằng giọng nói';

  function toggle() {
    if (!usable) {
      message.warning(tip);
      return;
    }
    if (!wake) chime();
    setJarvisSettings({ wake: !wake });
  }

  return (
    <span className="wake-toggle">
      <Tooltip title={tip}>
        <Button
          type="text"
          className={`head-btn jarvis-wake${wake ? ' on' : ''}`}
          icon={wake ? <AudioOutlined /> : <AudioMutedOutlined />}
          onClick={toggle}
          aria-label="Gọi Jarvis bằng giọng nói"
          aria-pressed={wake}
        />
      </Tooltip>
      {wake && shown && !quiet && (
        <span className="wake-heard" role="status">
          <AudioOutlined /> {shown}
        </span>
      )}
    </span>
  );
}
