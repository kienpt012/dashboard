import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Plus,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, auth } from '../api';
import { Spinner } from '../components/UI';
import { statusMeta } from '../types';

type DashboardDepartment={id:string;name:string;color:string;total:number;completed:number;progress:number};
type DashboardAlert={id:string;code:string;title:string;status:string;dueDate:string;department:{name:string}};
type DashboardUpdate={id:string;value:number;createdAt:string;target:{code:string;title:string;unit:string};user:{fullName:string}};
type DashboardData={
  year:number;
  total:number;
  counts:Record<string,number>;
  overallProgress:number;
  departments:DashboardDepartment[];
  alerts:DashboardAlert[];
  recent:DashboardUpdate[];
  updatedAt:string;
  riskThreshold:number;
};

export default function Dashboard(){
  const user=auth.user;
  const isGlobal=user?.role==='ADMIN';
  const canCreate=user?.role==='ADMIN';
  const scopeName=isGlobal?'toàn phường':user?.department?.name||'đơn vị của bạn';
  const [data,setData]=useState<DashboardData|null>(null);
  const [year,setYear]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  async function load(requestedYear?:number){
    setLoading(true);setError('');
    try{
      const result=await api<DashboardData>(`/dashboard${requestedYear?`?year=${requestedYear}`:''}`);
      setData(result);setYear(String(result.year));
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể tải dữ liệu tổng quan');
    }finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  if(loading&&!data)return <Spinner/>;
  if(!data)return <section className="panel"><h3>Chưa thể tải tổng quan</h3><p>{error}</p><button className="btn primary" onClick={()=>void load()}>Thử lại</button></section>;

  const completed=data.counts.COMPLETED??0;
  const onTrack=data.counts.ON_TRACK??0;
  const atRisk=data.counts.AT_RISK??0;
  const overdue=data.counts.OVERDUE??0;
  const needsAttention=atRisk+overdue;
  const completedRate=data.total?Math.round(completed/data.total*100):0;
  const ringProgress=Math.max(0,Math.min(data.overallProgress,100));
  const selectedYear=year===''?Number.NaN:Number(year);
  const yearIsValid=Number.isInteger(selectedYear)&&selectedYear>=2000&&selectedYear<=2100;
  const cards=[
    {label:'Tổng chỉ tiêu',value:data.total,meta:`Kế hoạch năm ${data.year}`,icon:Target,tone:'teal'},
    {label:'Đã hoàn thành',value:completed,meta:`${completedRate}% tổng chỉ tiêu`,icon:CheckCircle2,tone:'blue'},
    {label:'Đúng tiến độ',value:onTrack,meta:`${data.counts.NOT_STARTED??0} chỉ tiêu chưa bắt đầu`,icon:TrendingUp,tone:'green'},
    {label:'Cần tập trung',value:needsAttention,meta:`${overdue} chỉ tiêu quá hạn`,icon:AlertTriangle,tone:'orange'},
  ];

  return <>
    <div className="command-head">
      <div>
        <span className="eyebrow">ĐIỀU HÀNH · {data.year}</span>
        <h2>{isGlobal?'Bức tranh điều hành toàn phường':`Tiến độ của ${scopeName}`}</h2>
        <p>{isGlobal?'Tổng hợp kết quả thực hiện từ các đơn vị trực thuộc.':'Chỉ hiển thị chỉ tiêu và cập nhật thuộc phạm vi đơn vị của bạn.'}</p>
      </div>
      <div className="page-actions">
        <div className="year-picker" aria-label="Chọn năm kế hoạch">
          <button type="button" aria-label="Xem năm trước" disabled={loading||!yearIsValid||selectedYear<=2000} onClick={()=>void load(selectedYear-1)}><ChevronLeft/></button>
          <input aria-label="Năm kế hoạch" aria-invalid={!yearIsValid||undefined} type="number" min="2000" max="2100" value={year} disabled={loading} onChange={event=>setYear(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&yearIsValid)void load(selectedYear)}}/>
          <button type="button" aria-label="Xem năm sau" disabled={loading||!yearIsValid||selectedYear>=2100} onClick={()=>void load(selectedYear+1)}><ChevronRight/></button>
        </div>
        <button type="button" className="btn secondary" disabled={loading||!yearIsValid||selectedYear===data.year} onClick={()=>void load(selectedYear)}>Xem năm</button>
        {canCreate&&<Link className="btn primary" to={`/admin/targets?new=1&year=${data.year}`}><Plus/>Đặt chỉ tiêu</Link>}
      </div>
    </div>

    {error&&<div className="form-error" role="alert">{error}</div>}

    <div className="overview-banner">
      <div>
        <span>TIẾN ĐỘ CHUNG {isGlobal?'TOÀN PHƯỜNG':'CỦA ĐƠN VỊ'}</span>
        <strong>{data.overallProgress}<small>%</small></strong>
        <p>{data.overallProgress>=data.riskThreshold?'Tiến độ đang bám sát kế hoạch':'Cần ưu tiên các chỉ tiêu chậm tiến độ'}</p>
      </div>
      <div className="ring" style={{'--p':`${ringProgress*3.6}deg`} as React.CSSProperties}><span>{data.overallProgress}%</span></div>
      <div className="banner-stats">
        <div><CheckCircle2/><span><b>{completed}</b> hoàn thành</span></div>
        <div><Clock3/><span><b>{onTrack}</b> đúng tiến độ</span></div>
        <div><CircleAlert/><span><b>{needsAttention}</b> cần xử lý</span></div>
      </div>
      <div className="banner-date"><CalendarDays/><span>Dữ liệu cập nhật<br/><b>{new Date(data.updatedAt).toLocaleString('vi-VN')}</b></span></div>
    </div>

    <div className="stat-grid">{cards.map(({label,value,meta,icon:Icon,tone})=><div className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon/></div><span>{label}</span><strong>{value}</strong><p>{meta}</p></div>)}</div>

    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-head"><div><h3>{isGlobal?'Tiến độ theo phòng ban':'Tiến độ của đơn vị'}</h3><p>{isGlobal?'So sánh kết quả thực hiện giữa các đơn vị':`Các chỉ tiêu thuộc ${scopeName}`}</p></div><Link to="/admin/departments">{isGlobal?'Xem cơ cấu':'Thông tin đơn vị'} <ChevronRight/></Link></div>
        <div className="department-progress">{data.departments.length?data.departments.map(department=><div className="dep-row" key={department.id}><div className="dep-symbol" style={{background:`${department.color}18`,color:department.color}}><Building2/></div><div className="dep-info"><div><strong>{department.name}</strong><span>{department.completed}/{department.total} hoàn thành</span></div><div className="progress"><i style={{width:`${Math.min(department.progress,100)}%`,background:department.color}}/></div></div><b>{department.progress}%</b></div>):<p>Chưa có chỉ tiêu trong năm đã chọn.</p>}</div>
      </section>

      <section className="panel alert-panel">
        <div className="panel-head"><div><h3>Cần chú ý</h3><p>Ưu tiên xử lý sớm</p></div><span className="alert-count">{data.alerts.length}</span></div>
        <div className="alerts">{data.alerts.length?data.alerts.map(target=><Link to={`/admin/targets?year=${data.year}&search=${encodeURIComponent(target.code)}`} key={target.id}><div className={`alert-dot ${target.status==='OVERDUE'?'danger':''}`}><AlertTriangle/></div><div><strong>{target.title}</strong><span>{target.department.name} · Hạn {new Date(target.dueDate).toLocaleDateString('vi-VN')}</span></div><ChevronRight/></Link>):<p>Không có chỉ tiêu cần cảnh báo.</p>}</div>
      </section>

      <section className="panel span-2">
        <div className="panel-head"><div><h3>Cập nhật gần đây</h3><p>Dữ liệu mới nhất trong phạm vi {scopeName}</p></div></div>
        <div className="timeline">{data.recent.length?data.recent.map(update=><div className="timeline-row" key={update.id}><div className="timeline-mark"/><div><strong>{update.target.code} · {update.target.title}</strong><span>{update.user.fullName} cập nhật <b>{update.value.toLocaleString('vi-VN')} {update.target.unit}</b></span></div><time>{new Date(update.createdAt).toLocaleDateString('vi-VN')}</time></div>):<p>Chưa có cập nhật mới.</p>}</div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Cơ cấu trạng thái</h3><p>{data.total} chỉ tiêu đang theo dõi</p></div></div>
        <div className="status-stack"><div className="stack-bar">{Object.entries(data.counts).map(([key,count])=><i key={key} className={statusMeta[key]?.color} style={{width:`${data.total?count/data.total*100:0}%`}} title={statusMeta[key]?.label}/>)}</div>{Object.entries(data.counts).map(([key,count])=><div className="stack-label" key={key}><span><i className={statusMeta[key]?.color}/>{statusMeta[key]?.label||key}</span><b>{count}</b></div>)}</div>
      </section>
    </div>
  </>;
}
