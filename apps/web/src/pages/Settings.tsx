import { BellRing, CalendarDays, CheckCircle2, Gauge, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, auth } from '../api';
import { Empty, PageHead, Spinner } from '../components/UI';

type SystemSettings={
  id:string;
  defaultYear:number;
  warningDays:number;
  riskThreshold:number;
  updatedBy?:string|null;
  updatedAt?:string|null;
};

export default function Settings(){
  const isAdmin=auth.user?.role==='ADMIN';
  const [settings,setSettings]=useState<SystemSettings|null>(null);
  const [form,setForm]=useState({defaultYear:new Date().getFullYear(),warningDays:14,riskThreshold:70});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  async function load(){
    if(!isAdmin){setLoading(false);return}
    setLoading(true);setError('');
    try{
      const result=await api<SystemSettings>('/settings');
      setSettings(result);
      setForm({defaultYear:result.defaultYear,warningDays:result.warningDays,riskThreshold:result.riskThreshold});
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể tải thiết lập hệ thống');
    }finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  async function save(event:FormEvent){
    event.preventDefault();setSaving(true);setError('');setSuccess('');
    try{
      const result=await api<SystemSettings>('/settings',{method:'PATCH',body:JSON.stringify(form)});
      setSettings(result);
      setForm({defaultYear:result.defaultYear,warningDays:result.warningDays,riskThreshold:result.riskThreshold});
      setSuccess('Các thiết lập đã được áp dụng cho hệ thống.');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể lưu thiết lập');
    }finally{setSaving(false)}
  }

  if(!isAdmin)return <><PageHead eyebrow="CẤU HÌNH" title="Không có quyền truy cập" description="Chỉ quản trị viên hệ thống được thay đổi thiết lập chung."/><Empty title="Quyền truy cập bị giới hạn" description="Vui lòng quay lại trang tổng quan."/></>;

  return <>
    <PageHead eyebrow="CẤU HÌNH" title="Thiết lập hệ thống" description="Các thông số dưới đây được dùng trực tiếp khi tổng hợp tiến độ và phát sinh cảnh báo."/>
    {loading?<Spinner/>:<form onSubmit={save}>
      {error&&<div className="form-error">{error}</div>}
      {success&&<div className="import-result"><CheckCircle2/><div><strong>Lưu thành công</strong><p>{success}</p></div></div>}
      <div className="settings-grid">
        <section className="panel setting-card">
          <div className="setting-title"><CalendarDays/><div><h3>Năm kế hoạch mặc định</h3><p>Năm được chọn khi mở dashboard và báo cáo</p></div></div>
          <label>Năm kế hoạch<input type="number" required min={2000} max={2100} value={form.defaultYear} onChange={event=>setForm({...form,defaultYear:Number(event.target.value)})}/></label>
        </section>
        <section className="panel setting-card">
          <div className="setting-title"><BellRing/><div><h3>Cảnh báo trước hạn</h3><p>Số ngày hệ thống bắt đầu nhắc việc</p></div></div>
          <label>Số ngày cảnh báo<input type="number" required min={1} max={365} value={form.warningDays} onChange={event=>setForm({...form,warningDays:Number(event.target.value)})}/></label>
        </section>
        <section className="panel setting-card">
          <div className="setting-title"><Gauge/><div><h3>Ngưỡng rủi ro tiến độ</h3><p>Chỉ tiêu dưới ngưỡng này cần được chú ý</p></div></div>
          <label>Ngưỡng hoàn thành (%)<input type="number" required min={0} max={100} step="0.1" value={form.riskThreshold} onChange={event=>setForm({...form,riskThreshold:Number(event.target.value)})}/></label>
        </section>
      </div>
      <div className="settings-save">
        {settings?.updatedAt&&<span className="muted">Cập nhật gần nhất {new Date(settings.updatedAt).toLocaleString('vi-VN')}{settings.updatedBy?` bởi ${settings.updatedBy}`:''}</span>}
        <button className="btn primary" disabled={saving}><Save/>{saving?'Đang lưu...':'Lưu thiết lập'}</button>
      </div>
    </form>}
  </>;
}
