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
import { toast } from '../components/Toast';
import { Empty, Skeleton, SkeletonCards, StateCard } from '../components/UI';
import { CountUp, Reveal } from '../components/Motion';
import { statusMeta } from '../types';
import '../styles/dashboard.css';

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

/** Khung xương đúng hình hài trang tổng quan: đầu trang, dải băng, bốn thẻ số
 *  liệu và lưới bốn bảng. Người xem thấy ngay bố cục và không bị nhảy layout. */
function DashboardSkeleton(){
  return <div className="dash-skeleton" role="status" aria-label="Đang tải dữ liệu tổng quan">
    <div className="dash-skeleton-head">
      <div>
        <Skeleton className="skeleton-text" style={{width:150}}/>
        <Skeleton className="skeleton-title" style={{width:'min(420px, 72%)'}}/>
        <Skeleton className="skeleton-text" style={{width:'min(560px, 92%)'}}/>
      </div>
      <Skeleton style={{width:210,height:40}}/>
    </div>
    <Skeleton className="dash-skeleton-hero"/>
    <SkeletonCards count={4}/>
    <div className="dashboard-grid">
      <div className="panel span-2 dash-dept">
        <Skeleton className="skeleton-title"/>
        {[0,1,2,3].map(index=><Skeleton key={index} style={{height:44}}/>)}
      </div>
      <div className="panel alert-panel">
        <Skeleton className="skeleton-title"/>
        {[0,1,2].map(index=><Skeleton key={index} style={{height:58}}/>)}
      </div>
      <div className="panel span-2 dash-timeline">
        <Skeleton className="skeleton-title"/>
        {[0,1,2,3].map(index=><Skeleton key={index} style={{height:38}}/>)}
      </div>
      <div className="panel dash-stack">
        <Skeleton className="skeleton-title"/>
        <Skeleton style={{height:14}}/>
        {[0,1,2].map(index=><Skeleton key={index} style={{height:18}}/>)}
      </div>
    </div>
  </div>;
}

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
      const message=reason instanceof Error?reason.message:'Không thể tải dữ liệu tổng quan';
      setError(message);
      // Lần tải đầu đã có màn hình lỗi riêng; chỉ báo nổi khi trang đang hiển thị dữ liệu.
      if(data)toast.error('Không thể tải dữ liệu tổng quan',message);
    }finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  if(loading&&!data)return <DashboardSkeleton/>;
  if(!data)return <StateCard
    icon={<CircleAlert/>}
    title="Chưa thể tải tổng quan"
    description={error||'Không thể tải dữ liệu tổng quan'}
    action={<button className="btn primary" onClick={()=>void load()}>Thử lại</button>}
  />;

  const completed=data.counts.COMPLETED??0;
  const onTrack=data.counts.ON_TRACK??0;
  const atRisk=data.counts.AT_RISK??0;
  const overdue=data.counts.OVERDUE??0;
  const needsAttention=atRisk+overdue;
  const completedRate=data.total?Math.round(completed/data.total*100):0;
  const ringProgress=Math.max(0,Math.min(data.overallProgress,100));
  const selectedYear=year===''?Number.NaN:Number(year);
  const yearIsValid=Number.isInteger(selectedYear)&&selectedYear>=2000&&selectedYear<=2100;
  const statusEntries=Object.entries(data.counts);
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

    {error&&<div className="form-error load-error" role="alert">
      <span>{error}</span>
      <button type="button" className="btn sm secondary" disabled={loading} onClick={()=>void load(yearIsValid?selectedYear:undefined)}>Thử lại</button>
    </div>}

    {/* Dải băng tổng quan: vòng tiến độ là tiêu điểm, con số tổng đứng ngay cạnh,
        ba chỉ số nhịp độ và mốc dữ liệu tách sang cột phụ. */}
    <section className="overview-banner" aria-label="Tiến độ chung">
      <div className="ov-main">
        <div key={data.year} className="ring grow" role="img" aria-label={`Tiến độ chung ${data.overallProgress}%`} style={{'--p':`${ringProgress*3.6}deg`} as React.CSSProperties}><span><CountUp value={data.overallProgress} suffix="%"/></span></div>
        <div className="ov-lead">
          <span className="eyebrow light">TIẾN ĐỘ CHUNG {isGlobal?'TOÀN PHƯỜNG':'CỦA ĐƠN VỊ'}</span>
          <strong><CountUp value={data.overallProgress}/><small>%</small></strong>
          <p>{data.overallProgress>=data.riskThreshold?'Tiến độ đang bám sát kế hoạch':'Cần ưu tiên các chỉ tiêu chậm tiến độ'}</p>
        </div>
      </div>
      <div className="ov-side">
        <div className="banner-stats">
          <div><CheckCircle2 aria-hidden="true"/><span><b><CountUp value={completed}/></b> hoàn thành</span></div>
          <div><Clock3 aria-hidden="true"/><span><b><CountUp value={onTrack}/></b> đúng tiến độ</span></div>
          <div><CircleAlert aria-hidden="true"/><span><b><CountUp value={needsAttention}/></b> cần xử lý</span></div>
        </div>
        <p className="banner-date"><CalendarDays aria-hidden="true"/><span>Dữ liệu cập nhật<br/><b>{new Date(data.updatedAt).toLocaleString('vi-VN')}</b></span></p>
      </div>
    </section>

    <div className="stat-grid">{cards.map(({label,value,meta,icon:Icon,tone},index)=><Reveal key={label} index={index} asChild>
      <div className="stat-card lift"><div className={`stat-icon ${tone}`} aria-hidden="true"><Icon/></div><span>{label}</span><strong><CountUp value={value}/></strong><p>{meta}</p></div>
    </Reveal>)}</div>

    <div className="dashboard-grid">
      <Reveal asChild index={0}>
      <section className="panel span-2 dash-dept">
        <div className="panel-head">
          <div>
            <h3>{isGlobal?'Tiến độ theo phòng ban':'Tiến độ của đơn vị'}</h3>
            <p>{isGlobal?'So sánh kết quả thực hiện giữa các đơn vị':`Các chỉ tiêu thuộc ${scopeName}`}</p>
          </div>
          <Link to="/admin/departments">{isGlobal?'Xem cơ cấu':'Thông tin đơn vị'} <ChevronRight/></Link>
        </div>
        {data.departments.length
          ? <div className="department-progress">{data.departments.map(department=><div className="dep-row" key={department.id}>
              <span className="dep-symbol" style={{background:`${department.color}18`,color:department.color}} aria-hidden="true"><Building2/></span>
              <div className="dep-info">
                <div className="dep-line">
                  <strong>{department.name}</strong>
                  <span>{department.completed}/{department.total} hoàn thành</span>
                </div>
                <div className="progress"><i style={{width:`${Math.min(department.progress,100)}%`,background:department.color}}/></div>
              </div>
              <b className="dep-pct">{department.progress}%</b>
            </div>)}</div>
          : <Empty showIcon={false} title="Chưa có chỉ tiêu trong năm đã chọn" description={`Hãy chọn năm kế hoạch khác hoặc đặt chỉ tiêu cho ${scopeName}.`}/>}
      </section>
      </Reveal>

      <Reveal asChild index={1}>
      <section className="panel alert-panel">
        <div className="panel-head">
          <div><h3>Cần chú ý</h3><p>Ưu tiên xử lý sớm</p></div>
          <span className="alert-count" aria-label={`${data.alerts.length} chỉ tiêu cần chú ý`}>{data.alerts.length}</span>
        </div>
        {data.alerts.length
          ? <div className="alerts">{data.alerts.map(target=><Link className={`alert-item${target.status==='OVERDUE'?' urgent':''}`} to={`/admin/targets?year=${data.year}&search=${encodeURIComponent(target.code)}`} key={target.id}>
              <span className={`alert-dot ${target.status==='OVERDUE'?'danger':''}`} aria-hidden="true"><AlertTriangle/></span>
              <span className="alert-body">
                <strong>{target.title}</strong>
                <span className="alert-meta"><span className="code">{target.code}</span><span>{target.department.name}</span></span>
              </span>
              <span className="alert-side">
                <span className={`status ${statusMeta[target.status]?.color||'warn'}`}>{statusMeta[target.status]?.label||target.status}</span>
                <time dateTime={target.dueDate}>Hạn {new Date(target.dueDate).toLocaleDateString('vi-VN')}</time>
              </span>
              <ChevronRight aria-hidden="true"/>
            </Link>)}</div>
          : <Empty showIcon={false} title="Không có chỉ tiêu cần cảnh báo" description="Mọi chỉ tiêu trong phạm vi này đều chưa chạm ngưỡng rủi ro."/>}
      </section>
      </Reveal>

      <Reveal asChild index={2}>
      <section className="panel span-2 dash-timeline">
        <div className="panel-head"><div><h3>Cập nhật gần đây</h3><p>Dữ liệu mới nhất trong phạm vi {scopeName}</p></div></div>
        {data.recent.length
          ? <div className="timeline">{data.recent.map(update=><div className="timeline-row" key={update.id}>
              <span className="timeline-mark" aria-hidden="true"/>
              <div className="timeline-body">
                <strong><span className="code">{update.target.code}</span><span>{update.target.title}</span></strong>
                <span>{update.user.fullName} cập nhật <b>{update.value.toLocaleString('vi-VN')} {update.target.unit}</b></span>
              </div>
              <time dateTime={update.createdAt}>{new Date(update.createdAt).toLocaleDateString('vi-VN')}</time>
            </div>)}</div>
          : <Empty showIcon={false} title="Chưa có cập nhật mới" description={`Các lần báo cáo số liệu của ${scopeName} sẽ hiện tại đây.`}/>}
      </section>
      </Reveal>

      <Reveal asChild index={3}>
      <section className="panel dash-stack">
        <div className="panel-head"><div><h3>Cơ cấu trạng thái</h3><p>{data.total} chỉ tiêu đang theo dõi</p></div></div>
        {data.total
          ? <div className="status-stack">
              <div className="stack-bar" role="img" aria-label="Tỷ trọng chỉ tiêu theo trạng thái">
                {statusEntries.map(([key,count])=><i key={key} className={statusMeta[key]?.color||'neutral'} style={{width:`${data.total?count/data.total*100:0}%`}} title={statusMeta[key]?.label}/>)}
              </div>
              <ul className="stack-legend">
                {statusEntries.map(([key,count])=><li className="stack-label" key={key}>
                  <span><i className={statusMeta[key]?.color||'neutral'} aria-hidden="true"/>{statusMeta[key]?.label||key}</span>
                  <b>{count}</b>
                </li>)}
              </ul>
            </div>
          : <Empty showIcon={false} title="Chưa có chỉ tiêu để phân loại" description="Cơ cấu trạng thái sẽ hiện khi năm kế hoạch đã có chỉ tiêu."/>}
      </section>
      </Reveal>
    </div>
  </>;
}
