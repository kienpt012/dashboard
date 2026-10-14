import { BellRing, CalendarDays, CheckCircle2, Clock3, FileQuestion, Gauge, MessageSquareText, MonitorPlay, Repeat, Save, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, auth } from '../api';
import { hasAnyRole, ADMIN_ROLES } from '../authz';
import { Empty, PageHead } from '../components/UI';
import { currentVietnamYear } from '../date';
import '../styles/org.css';

type SystemSettings={
  id:string;
  version:number;
  defaultYear:number;
  warningDays:number;
  riskThreshold:number;
  feedbackFirstResponseDays:number;
  feedbackResolutionDays:number;
  feedbackCitizenResponseDays:number;
  reportAutoApproveDays:number;
  proposalAutoApproveDays:number;
  explanationDueDays:number;
  assignmentStallDays:number;
  maxTransfers:number;
  wallboardRotateSeconds:number;
  updatedBy?:string|null;
  updatedAt?:string|null;
};

type FormState=Omit<SystemSettings,'id'|'version'|'updatedBy'|'updatedAt'>;
const FORM_KEYS:(keyof FormState)[]=['defaultYear','warningDays','riskThreshold','feedbackFirstResponseDays','feedbackResolutionDays','feedbackCitizenResponseDays','reportAutoApproveDays','proposalAutoApproveDays','explanationDueDays','assignmentStallDays','maxTransfers','wallboardRotateSeconds'];
const pick=(value:SystemSettings):FormState=>Object.fromEntries(FORM_KEYS.map(key=>[key,value[key]])) as FormState;

/** Thời hạn trách nhiệm (bản 2): mỗi trạng thái chờ đều có hạn, quá hạn hệ thống tự xử lý và ghi trách nhiệm. */
const ACCOUNTABILITY_FIELDS:{key:keyof FormState;title:string;hint:string;label:string;min:number;max:number;icon:typeof Clock3}[]=[
  {key:'reportAutoApproveDays',title:'Tự thông qua báo cáo số liệu',hint:'Cán bộ gửi số liệu mà trưởng phòng không duyệt trong số ngày này thì hệ thống tự thông qua và ghi trách nhiệm người duyệt. 0 = tắt.',label:'Số ngày',min:0,max:60,icon:ShieldCheck},
  {key:'proposalAutoApproveDays',title:'Tự thông qua đề xuất chỉ tiêu',hint:'Đề xuất đã trình không ai quyết định trong số ngày này thì tự thành chỉ tiêu. Đề xuất do AI trích xuất không bao giờ tự thông qua khi chưa có người trình. 0 = tắt.',label:'Số ngày',min:0,max:30,icon:CheckCircle2},
  {key:'explanationDueDays',title:'Thời hạn giải trình',hint:'Lãnh đạo yêu cầu giải trình thì phòng chủ trì phải trả lời trong số ngày này; quá hạn thì báo lãnh đạo.',label:'Số ngày',min:1,max:30,icon:FileQuestion},
  {key:'assignmentStallDays',title:'Nhắc giao người phụ trách',hint:'Chỉ tiêu chưa giao chuyên viên quá số ngày này thì nhắc trưởng phòng; quá gấp đôi thì báo lãnh đạo. 0 = tắt.',label:'Số ngày',min:0,max:30,icon:UserPlus},
  {key:'maxTransfers',title:'Số lần chuyển việc tối đa',hint:'Chuyên viên được chuyển chỉ tiêu cho đồng nghiệp bấy nhiêu lần; hết lượt chỉ được trả về trưởng phòng — chống "đá việc".',label:'Số lần',min:0,max:5,icon:Repeat},
  {key:'wallboardRotateSeconds',title:'Chuyển trang trình chiếu',hint:'Màn hình phòng họp tự chuyển sang bộ chỉ tiêu hoặc phòng tiếp theo sau số giây này.',label:'Số giây',min:5,max:300,icon:MonitorPlay},
];

export default function Settings(){
  const isAdmin=hasAnyRole(auth.user,ADMIN_ROLES);
  const [settings,setSettings]=useState<SystemSettings|null>(null);
  const [form,setForm]=useState<FormState>({defaultYear:currentVietnamYear(),warningDays:14,riskThreshold:70,feedbackFirstResponseDays:2,feedbackResolutionDays:10,feedbackCitizenResponseDays:7,
    reportAutoApproveDays:7,proposalAutoApproveDays:3,explanationDueDays:3,assignmentStallDays:3,maxTransfers:1,wallboardRotateSeconds:20});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  async function load(){
    if(!isAdmin){setLoading(false);return}
    setLoading(true);setError('');setSuccess('');setSettings(null);
    try{
      const result=await api<SystemSettings>('/settings');
      setSettings(result);
      setForm(pick(result));
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể tải thiết lập hệ thống');
    }finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  async function save(event:FormEvent){
    event.preventDefault();
    if(!settings){
      setError('Thiết lập chưa được tải thành công. Vui lòng tải lại trước khi lưu.');
      return;
    }
    setSaving(true);setError('');setSuccess('');
    try{
      const result=await api<SystemSettings>('/settings',{method:'PATCH',body:JSON.stringify({...form,expectedVersion:settings.version})});
      setSettings(result);
      setForm(pick(result));
      setSuccess('Các thiết lập đã được áp dụng cho hệ thống.');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể lưu thiết lập');
    }finally{setSaving(false)}
  }

  if(!isAdmin)return <><PageHead eyebrow="CẤU HÌNH" title="Không có quyền truy cập" description="Chỉ quản trị viên hệ thống được thay đổi thiết lập chung."/><Empty title="Quyền truy cập bị giới hạn" description="Vui lòng quay lại trang tổng quan."/></>;

  return <>
    <PageHead eyebrow="CẤU HÌNH" title="Thiết lập hệ thống" description="Các thông số dưới đây được dùng trực tiếp khi tổng hợp tiến độ và phát sinh cảnh báo."/>
    {loading?<div className="settings-grid" role="status" aria-label="Đang tải thiết lập">{Array.from({length:6},(_,index)=><div key={index} className="skeleton" style={{height:190,borderRadius:'var(--r-lg)'}}/>)}</div>:!settings?<section className="panel settings-load-error" role="alert">
      <div className="form-error">{error||'Không thể tải thiết lập hệ thống.'}</div>
      <p className="muted">Hệ thống đã khóa biểu mẫu để tránh ghi đè bằng giá trị mặc định khi dữ liệu chưa tải đủ.</p>
      <button type="button" className="btn secondary" onClick={()=>void load()}>Thử tải lại</button>
    </section>:<form onSubmit={save}>
      {error&&<div className="form-error" role="alert">{error}</div>}
      {success&&<div className="import-result" role="status"><CheckCircle2/><div><strong>Lưu thành công</strong><p>{success}</p></div></div>}
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
          <div className="setting-title"><Gauge/><div><h3>Ngưỡng đúng tiến độ</h3><p>Chỉ tiêu chưa hoàn thành và thấp hơn tỷ lệ này được cảnh báo có rủi ro</p></div></div>
          <label>Ngưỡng đúng tiến độ (%)<input type="number" required min={0} max={100} step="0.1" value={form.riskThreshold} onChange={event=>setForm({...form,riskThreshold:Number(event.target.value)})}/></label>
        </section>
        <section className="panel setting-card">
          <div className="setting-title"><MessageSquareText/><div><h3>Phản hồi ban đầu</h3><p>Thời gian tối đa để đơn vị liên hệ hoặc phản hồi lần đầu</p></div></div>
          <label>Số ngày phản hồi<input type="number" required min={1} max={30} value={form.feedbackFirstResponseDays} onChange={event=>setForm({...form,feedbackFirstResponseDays:Number(event.target.value)})}/></label>
        </section>
        <section className="panel setting-card">
          <div className="setting-title"><Clock3/><div><h3>Thời hạn xử lý phản ánh</h3><p>SLA mặc định; mức ưu tiên cao sẽ được rút ngắn tự động</p></div></div>
          <label>Số ngày xử lý<input type="number" required min={form.feedbackFirstResponseDays} max={365} value={form.feedbackResolutionDays} onChange={event=>setForm({...form,feedbackResolutionDays:Number(event.target.value)})}/></label>
        </section>
        <section className="panel setting-card">
          <div className="setting-title"><MessageSquareText/><div><h3>Thời hạn bổ sung thông tin</h3><p>Thời gian người dân phản hồi yêu cầu bổ sung; SLA xử lý được tạm dừng trong thời gian này</p></div></div>
          <label>Số ngày chờ bổ sung<input type="number" required min={1} max={60} value={form.feedbackCitizenResponseDays} onChange={event=>setForm({...form,feedbackCitizenResponseDays:Number(event.target.value)})}/></label>
        </section>
      </div>
      <h3 className="settings-group-title">Thời hạn trách nhiệm</h3>
      <p className="muted settings-group-note">Mọi việc chờ đều có hạn. Quá hạn, hệ thống tự xử lý và ghi rõ ai đã để chậm — hiện ở màn hình Trách nhiệm người đứng đầu.</p>
      <div className="settings-grid">
        {ACCOUNTABILITY_FIELDS.map(item=>{const Icon=item.icon;return <section key={item.key} className="panel setting-card">
          <div className="setting-title"><Icon/><div><h3>{item.title}</h3><p>{item.hint}</p></div></div>
          <label>{item.label}<input type="number" required min={item.min} max={item.max} step={1} value={form[item.key]} onChange={event=>setForm({...form,[item.key]:Number(event.target.value)})}/></label>
        </section>})}
      </div>
      <div className="settings-save">
        {settings?.updatedAt&&<span className="muted">Cập nhật gần nhất {new Date(settings.updatedAt).toLocaleString('vi-VN')}{settings.updatedBy?` bởi ${settings.updatedBy}`:''}</span>}
        <button className="btn primary" disabled={saving||!settings}><Save/>{saving?'Đang lưu...':'Lưu thiết lập'}</button>
      </div>
    </form>}
  </>;
}
