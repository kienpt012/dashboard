import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function PageHead({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description:string;actions?:ReactNode}){return <div className="page-head"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2><p>{description}</p></div>{actions&&<div className="page-actions">{actions}</div>}</div>}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide?'wide':''}`} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button onClick={onClose}><X/></button></div>{children}</div></div>}
export function Empty({title='Chưa có dữ liệu',description='Dữ liệu sẽ xuất hiện tại đây sau khi được tạo.'}:{title?:string;description?:string}){return <div className="empty"><div>○</div><strong>{title}</strong><p>{description}</p></div>}
export function Spinner(){return <div className="spinner-wrap"><div className="spinner"/></div>}
