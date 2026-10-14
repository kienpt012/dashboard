import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fmtDateTime } from '../ioc-format';
import { useLocality } from '../locality';
import { screenCodeFor } from '../nav';

/**
 * Dải định danh ở chân mọi màn hình: mã màn hình · tên ứng dụng · thời điểm tải dữ liệu.
 * Khách hàng nêu: chụp màn hình bị mất dòng tiêu đề thì không biết là màn hình nào, chụp lúc mấy giờ.
 */
export default function ScreenFooter(){
  const location=useLocation();
  const locality=useLocality();
  const [loadedAt,setLoadedAt]=useState(()=>new Date());
  useEffect(()=>setLoadedAt(new Date()),[location.pathname,location.search]);
  return <footer className="screen-footer" aria-label="Định danh màn hình">
    <span className="code">{screenCodeFor(location.pathname)}</span>
    <span>{locality.brandName}</span>
    <span>{fmtDateTime(loadedAt)}</span>
  </footer>;
}
