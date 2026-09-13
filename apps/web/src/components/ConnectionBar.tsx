import { CloudOff, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Dải báo mất kết nối mạng.
 *
 *  Cán bộ thường nhập số liệu ở phòng họp hoặc ngoài hiện trường, nơi sóng chập
 *  chờn. Không có dấu hiệu gì thì họ điền xong cả biểu mẫu rồi mới biết là không
 *  lưu được — và thường đổ cho hệ thống hỏng. Báo trước một dòng là đủ.
 *
 *  `navigator.onLine` chỉ biết máy có nối mạng hay không, không biết máy chủ còn
 *  sống; vì vậy chữ dùng ở đây nói về "kết nối mạng", không hứa hẹn gì hơn thế.
 */
export default function ConnectionBar() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setOffline(true);
      setRestored(false);
    };
    const goOnline = () => {
      setOffline(false);
      setRestored(true);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => setRestored(false), 4000);
    return () => window.clearTimeout(timer);
  }, [restored]);

  if (!offline && !restored) return null;

  return (
    <div className={`connection-bar${offline ? ' offline' : ' online'}`} role="status" aria-live="polite">
      {offline ? <CloudOff aria-hidden="true" /> : <Wifi aria-hidden="true" />}
      <span>
        {offline
          ? 'Mất kết nối mạng. Bạn vẫn xem được nội dung đã tải, nhưng thao tác lưu sẽ không thực hiện được cho tới khi có mạng trở lại.'
          : 'Đã có kết nối mạng trở lại.'}
      </span>
    </div>
  );
}
