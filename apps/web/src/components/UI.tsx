import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
export function PageHead({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description:string;actions?:ReactNode}){return <div className="page-head"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2><p>{description}</p></div>{actions&&<div className="page-actions">{actions}</div>}</div>}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const titleId=useId();
  const dialogRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;

  useEffect(()=>{
    const returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const frame=window.requestAnimationFrame(()=>{
      const preferred=dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-modal-initial-focus]');
      (preferred||dialogRef.current)?.focus();
    });
    const handleEscape=(event:globalThis.KeyboardEvent)=>{
      if(event.key==='Escape')closeRef.current();
    };
    document.addEventListener('keydown',handleEscape);
    return()=>{
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown',handleEscape);
      document.body.style.overflow=previousOverflow;
      returnFocus?.focus();
    };
  },[]);

  function keepFocusInside(event:KeyboardEvent<HTMLDivElement>){
    if(event.key!=='Tab')return;
    const items=[...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')||[])];
    if(!items.length){event.preventDefault();dialogRef.current?.focus();return}
    const first=items[0];
    const last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div ref={dialogRef} className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={keepFocusInside} onMouseDown={event=>event.stopPropagation()}>
      <div className="modal-head"><h3 id={titleId}>{title}</h3><button type="button" onClick={onClose} aria-label="Đóng hộp thoại"><X/></button></div>{children}
    </div>
  </div>;
}
export function Empty({title='Chưa có dữ liệu',description='Dữ liệu sẽ xuất hiện tại đây sau khi được tạo.'}:{title?:string;description?:string}){return <div className="empty"><div aria-hidden="true">○</div><strong>{title}</strong><p>{description}</p></div>}
export function Spinner(){return <div className="spinner-wrap" role="status" aria-label="Đang tải dữ liệu"><div className="spinner" aria-hidden="true"/></div>}
