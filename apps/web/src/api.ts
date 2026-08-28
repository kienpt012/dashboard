import type { User } from './types';

const API_URL=import.meta.env.VITE_API_URL||'http://localhost:3000/api';
const TOKEN_KEY='ioc_token';
const USER_KEY='ioc_user';

export class ApiError extends Error{
  status:number;
  details:unknown;
  constructor(message:string,status:number,details?:unknown){
    super(message);
    this.name='ApiError';
    this.status=status;
    this.details=details;
  }
}

export const auth={
  get token(){return localStorage.getItem(TOKEN_KEY)},
  get user():User|null{
    const raw=localStorage.getItem(USER_KEY);
    if(!raw)return null;
    try{return JSON.parse(raw) as User}catch{localStorage.removeItem(USER_KEY);return null}
  },
  set(data:{accessToken:string;user:User}){
    localStorage.setItem(TOKEN_KEY,data.accessToken);
    localStorage.setItem(USER_KEY,JSON.stringify(data.user));
  },
  setUser(user:User){localStorage.setItem(USER_KEY,JSON.stringify(user))},
  clear(){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY)},
};

function errorMessage(payload:any,status:number){
  const message=Array.isArray(payload?.message)?payload.message[0]:payload?.message;
  if(message)return String(message);
  if(status===401)return 'Phiên đăng nhập đã hết hạn';
  if(status===403)return 'Bạn không có quyền thực hiện thao tác này';
  if(status===504)return 'Yêu cầu xử lý quá thời gian chờ. Dịch vụ AI có thể đang bận; vui lòng thử lại sau.';
  if(status===502||status===503)return 'Dịch vụ xử lý tạm thời chưa sẵn sàng. Vui lòng thử lại sau.';
  return 'Có lỗi xảy ra khi xử lý yêu cầu';
}

async function readError(response:Response){
  const contentType=response.headers.get('content-type')||'';
  try{
    if(contentType.includes('application/json'))return await response.json();
    const text=await response.text();
    // Không đưa nguyên trang lỗi HTML của nginx/proxy lên giao diện người dùng.
    if(contentType.includes('text/html')||/^\s*(?:<!doctype\s+html|<html)/i.test(text))return {};
    return text.trim()?{message:text}:{};
  }
  catch{return {}}
}

function redirectToLogin(requestPath:string){
  if(requestPath==='/auth/login'||window.location.pathname==='/admin/login')return;
  const current=`${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/admin/login?next=${encodeURIComponent(current)}`);
}

async function request(path:string,options:RequestInit={}){
  const headers=new Headers(options.headers);
  const isForm=options.body instanceof FormData;
  if(options.body!=null&&!isForm&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  if(auth.token&&!headers.has('Authorization'))headers.set('Authorization',`Bearer ${auth.token}`);

  let response:Response;
  try{response=await fetch(`${API_URL}${path}`,{...options,headers})}
  catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw error;
    throw new ApiError('Không thể kết nối đến máy chủ',0,error);
  }

  if(!response.ok){
    const payload=await readError(response);
    if(response.status===401){auth.clear();redirectToLogin(path)}
    throw new ApiError(errorMessage(payload,response.status),response.status,payload);
  }
  return response;
}

export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const response=await request(path,options);
  if(response.status===204)return undefined as T;
  const contentType=response.headers.get('content-type')||'';
  if(contentType.includes('application/json'))return response.json() as Promise<T>;
  return await response.text() as T;
}

export async function downloadApi(path:string,options:RequestInit={}):Promise<Blob>{
  const response=await request(path,options);
  return response.blob();
}

export async function downloadApiResponse(path:string,options:RequestInit={}):Promise<Response>{
  // Editor preview URLs are also consumed by the public renderer and include
  // the nginx-facing `/api` prefix. `request` already owns that prefix through
  // VITE_API_URL, so normalize it here to keep Docker and Vite dev identical.
  const requestPath=path.replace(/^\/api(?=\/)/,'');
  return request(requestPath,options);
}

export function resolveApiUrl(path:string):string{
  if(/^https:\/\//i.test(path))return path;
  const normalizedBase=API_URL.replace(/\/$/,'');
  if(path.startsWith('/api/'))return `${normalizedBase}${path.slice(4)}`;
  return `${normalizedBase}${path.startsWith('/')?'':'/'}${path}`;
}
