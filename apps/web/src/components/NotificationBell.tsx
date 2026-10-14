import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { NotificationItem } from '../ioc-types';
import { relativeTime } from '../ioc-format';

/** Chuông thông báo: giao việc, nhắc việc, tự thông qua, yêu cầu giải trình… Hỏi máy chủ mỗi phút. */
export default function NotificationBell(){
  const [open,setOpen]=useState(false);
  const [unread,setUnread]=useState(0);
  const [items,setItems]=useState<NotificationItem[]>([]);
  const [loading,setLoading]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const navigate=useNavigate();

  useEffect(()=>{
    let active=true;
    const load=()=>api<{unreadCount:number}>('/notifications/count').then(result=>{if(active)setUnread(result.unreadCount)}).catch(()=>undefined);
    void load();
    const timer=window.setInterval(load,60_000);
    return()=>{active=false;window.clearInterval(timer)};
  },[]);

  useEffect(()=>{
    if(!open)return;
    setLoading(true);
    api<{items:NotificationItem[];unreadCount:number}>('/notifications?take=20')
      .then(result=>{setItems(result.items);setUnread(result.unreadCount)})
      .catch(()=>undefined)
      .finally(()=>setLoading(false));
    const close=(event:MouseEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))setOpen(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',close);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape)};
  },[open]);

  async function openItem(item:NotificationItem){
    if(!item.readAt){
      await api(`/notifications/${item.id}/read`,{method:'POST'}).catch(()=>undefined);
      setUnread(value=>Math.max(0,value-1));
      setItems(list=>list.map(entry=>entry.id===item.id?{...entry,readAt:new Date().toISOString()}:entry));
    }
    setOpen(false);
    if(item.link)navigate(item.link);
  }

  async function readAll(){
    await api('/notifications/read-all',{method:'POST'}).catch(()=>undefined);
    setUnread(0);
    setItems(list=>list.map(entry=>({...entry,readAt:entry.readAt??new Date().toISOString()})));
  }

  return <div className="notif" ref={ref}>
    <button type="button" className="notif-trigger" onClick={()=>setOpen(value=>!value)} aria-expanded={open} aria-label={unread?`${unread} thông báo chưa đọc`:'Thông báo'}>
      <Bell aria-hidden="true"/>
      {unread>0&&<i>{unread>99?'99+':unread}</i>}
    </button>
    {open&&<div className="notif-panel" role="dialog" aria-label="Thông báo">
      <div className="notif-head">
        <strong>Thông báo</strong>
        {unread>0&&<button type="button" className="btn ghost sm" onClick={()=>void readAll()}><CheckCheck aria-hidden="true"/>Đã đọc hết</button>}
      </div>
      {loading&&!items.length?<p className="notif-empty">Đang tải…</p>:!items.length?<p className="notif-empty">Chưa có thông báo nào.</p>:
        <ul>
          {items.map(item=><li key={item.id}>
            <button type="button" className={item.readAt?'':'unread'} onClick={()=>void openItem(item)}>
              <strong>{item.title}</strong>
              {item.body&&<span>{item.body}</span>}
              <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
            </button>
          </li>)}
        </ul>}
    </div>}
  </div>;
}
