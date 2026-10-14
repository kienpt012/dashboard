// Định dạng dùng chung cho các màn hình IOC bản 2 (giờ Việt Nam, số kiểu Việt Nam).

const numberFormat=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2});
const dateFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'});
const dateTimeFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'});

export function fmtNumber(value:number|null|undefined){
  return value===null||value===undefined||!Number.isFinite(value)?'—':numberFormat.format(value);
}

export function fmtDate(value?:string|null){
  return value?dateFormat.format(new Date(value)):'—';
}

export function fmtDateTime(value?:string|Date|null){
  return value?dateTimeFormat.format(typeof value==='string'?new Date(value):value):'—';
}

export function relativeTime(value:string){
  const diff=Date.now()-new Date(value).getTime();
  const minutes=Math.round(diff/60_000);
  if(minutes<1)return 'vừa xong';
  if(minutes<60)return `${minutes} phút trước`;
  const hours=Math.round(minutes/60);
  if(hours<24)return `${hours} giờ trước`;
  const days=Math.round(hours/24);
  if(days<30)return `${days} ngày trước`;
  return fmtDate(value);
}

/** Thời gian còn lại tới một mốc (dùng cho đếm ngược tự thông qua): "còn 18 giờ", "quá 2 ngày". */
export function untilText(value?:string|null){
  if(!value)return '';
  const diff=new Date(value).getTime()-Date.now();
  const hours=Math.round(Math.abs(diff)/3_600_000);
  const text=hours<48?`${hours} giờ`:`${Math.round(hours/24)} ngày`;
  return diff>=0?`còn ${text}`:`quá ${text}`;
}

/** Giá trị kèm đơn vị; chỉ tiêu thống kê không có mục tiêu. */
export function valueWithUnit(value:number|null|undefined,unit:string){
  return `${fmtNumber(value)} ${unit}`.trim();
}

/** Tông màu theo trạng thái để tô dòng, ô, vạch tiến độ. */
export const statusTone:Record<string,'ok'|'warn'|'bad'|'info'|'neutral'>={
  COMPLETED:'info',
  ON_TRACK:'ok',
  AT_RISK:'warn',
  OVERDUE:'bad',
  NOT_STARTED:'neutral',
};
