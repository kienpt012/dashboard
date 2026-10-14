import { useEffect, useState } from 'react';
import { api } from './api';

// Hồ sơ địa phương phía giao diện: tên đơn vị, tên ứng dụng, màu thương hiệu. Mọi tiêu đề, chân trang,
// trang đăng nhập đọc từ đây — không còn tên địa phương nào viết cứng trong giao diện.

export type PublicLocality={
  configured:boolean;
  kind:string;
  kindLabel:string;
  name:string;
  agencyName:string;
  shortName:string;
  brandName:string;
  provinceName?:string|null;
  adminUnitCode?:string|null;
  address?:string|null;
  phone?:string|null;
  email?:string|null;
  website?:string|null;
  primaryColor:string;
};

const FALLBACK:PublicLocality={
  configured:false,
  kind:'PHUONG',
  kindLabel:'Phường',
  name:'Đơn vị chưa thiết lập',
  agencyName:'Ủy ban nhân dân',
  shortName:'',
  brandName:'IOC',
  primaryColor:'#1d4ed8',
};
const CACHE_KEY='ioc_locality';

function readCache():PublicLocality{
  try{
    const raw=localStorage.getItem(CACHE_KEY);
    return raw?{...FALLBACK,...JSON.parse(raw)}:FALLBACK;
  }catch{return FALLBACK}
}

let current:PublicLocality=readCache();
let pending:Promise<PublicLocality>|null=null;
const listeners=new Set<(value:PublicLocality)=>void>();

export function getLocality(){return current}

export function refreshLocality(){
  pending=api<PublicLocality>('/public/locality')
    .then(value=>{
      current={...FALLBACK,...value};
      try{localStorage.setItem(CACHE_KEY,JSON.stringify(current))}catch{/* bỏ qua khi bị chặn lưu trữ */}
      listeners.forEach(listener=>listener(current));
      return current;
    })
    .catch(()=>current)
    .finally(()=>{pending=null});
  return pending;
}

/** Hook đọc hồ sơ địa phương; tải một lần cho cả ứng dụng, dùng bản đệm trong lúc chờ. */
export function useLocality(){
  const [value,setValue]=useState(current);
  useEffect(()=>{
    listeners.add(setValue);
    if(!pending)void refreshLocality();
    return()=>{listeners.delete(setValue)};
  },[]);
  return value;
}

/** Hai chữ cái đại diện cho biểu tượng thương hiệu: "Lái Thiêu" → "LT". */
export function localityInitials(locality:PublicLocality){
  const words=(locality.shortName||locality.name).trim().split(/\s+/).filter(Boolean);
  return (words.length>=2?words[0][0]+words[words.length-1][0]:(words[0]??'IO').slice(0,2)).toUpperCase();
}
