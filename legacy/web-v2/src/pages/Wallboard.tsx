import { CalendarX, ChevronLeft, ChevronRight, Maximize, MessageSquareWarning, Minimize, MonitorPlay, Pause, Play, RefreshCw, Repeat2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, auth } from '../api';
import { FRAMEWORK_EDITOR_ROLES, hasAnyRole } from '../authz';
import { Skeleton } from '../components/UI';
import { fmtDate, fmtDateTime, fmtNumber, statusTone, valueWithUnit } from '../ioc-format';
import type { FrameworkKind, FrameworkSummary, TargetBrief, TargetStatusKey } from '../ioc-types';
import { localityInitials, useLocality, type PublicLocality } from '../locality';
import { screenCodeFor } from '../nav';
import { statusMeta } from '../types';
import '../styles/ioc.css';
import '../styles/ioc-wallboard.css';

// Trình chiếu phòng họp (DH-03): toàn màn hình, tự chuyển qua từng bộ chỉ tiêu, từng phòng và việc bị treo.
// Dữ liệu tải lại mỗi phút nhưng giữ nguyên trang đang chiếu và thời gian còn lại của trang đó.

type WallTarget=TargetBrief&{missingPeriods:string[];explanationRequested:boolean};
type FrameworkSlide={type:'framework';id:string;title:string;kind:FrameworkKind;kindLabel:string;legalBasis?:string|null;summary:FrameworkSummary;targets:WallTarget[]};
type DepartmentSlide={type:'department';id:string;title:string;color:string;targets:WallTarget[]};
type StalledSlide={type:'stalled';id:string;title:string;targets:WallTarget[]};
type WallboardData={year:number;generatedAt:string;rotateSeconds:number;locality:PublicLocality;slides:(FrameworkSlide|DepartmentSlide)[];stalled:WallTarget[]};
type Slide=(FrameworkSlide|DepartmentSlide|StalledSlide)&{key:string};
type Tone='ok'|'warn'|'bad'|'info';
type SummaryItem={label:string;value:ReactNode;of?:ReactNode;tone?:Tone};

const REFRESH_MS=60_000;
const IDLE_MS=3_000;
const NARROW_QUERY='(max-width: 760px)';
const ESTIMATED_TILE=132;
const URGENCY:Record<string,number>={OVERDUE:0,AT_RISK:1,NOT_STARTED:2,ON_TRACK:3,COMPLETED:4};
const STATUSES:TargetStatusKey[]=['NOT_STARTED','ON_TRACK','AT_RISK','OVERDUE','COMPLETED'];

const timeFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const weekdayFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long'});
const dayFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'});

/** Đỏ trước: quá hạn → cần theo dõi → chưa bắt đầu → đúng tiến độ → hoàn thành; cùng mức thì việc bị giải trình, thiếu báo cáo lên trước. */
function byUrgency(targets:WallTarget[]){
  return [...targets].sort((a,b)=>(URGENCY[a.status]??5)-(URGENCY[b.status]??5)
    ||Number(b.explanationRequested)-Number(a.explanationRequested)
    ||Number(b.missingPeriods.length>0)-Number(a.missingPeriods.length>0));
}

function buildSlides(data:WallboardData):Slide[]{
  const slides:Slide[]=data.slides.map(slide=>({...slide,key:`${slide.type}:${slide.id}`,targets:byUrgency(slide.targets)}));
  if(data.stalled.length)slides.push({type:'stalled',id:'stalled',key:'stalled',title:'Việc bị treo cần lãnh đạo xử lý',targets:byUrgency(data.stalled)});
  return slides;
}

function countStatuses(targets:WallTarget[]){
  const counts=Object.fromEntries(STATUSES.map(status=>[status,0])) as Record<TargetStatusKey,number>;
  for(const target of targets)counts[target.status]=(counts[target.status]??0)+1;
  return counts;
}

const toneIf=(value:number,tone:Tone)=>value>0?tone:undefined;
const needsAssignee=(target:WallTarget)=>!target.assigneeName&&target.valueSource==='MANUAL';

function summaryFor(slide:Slide):SummaryItem[]{
  const targets=slide.targets;
  const missing=targets.filter(target=>target.missingPeriods.length).length;
  const explained=targets.filter(target=>target.explanationRequested).length;
  const unassigned=targets.filter(needsAssignee).length;
  const tail:SummaryItem[]=[{label:'Thiếu báo cáo',value:missing,tone:toneIf(missing,'warn')}];
  if(explained)tail.push({label:'Bị yêu cầu giải trình',value:explained,tone:'bad'});
  if(slide.type==='stalled'){
    return [{label:'Việc bị treo',value:targets.length,tone:'bad'},{label:'Chưa giao người phụ trách',value:unassigned,tone:toneIf(unassigned,'warn')},...tail];
  }
  if(slide.type==='framework'&&slide.kind==='STAT'){
    return [{label:'Đã có số liệu',value:slide.summary.reported,of:slide.summary.total,tone:toneIf(slide.summary.reported,'ok')},...tail];
  }
  const counts=slide.type==='framework'?slide.summary.counts:countStatuses(targets);
  const total=slide.type==='framework'?slide.summary.total:targets.length;
  const good=counts.COMPLETED+counts.ON_TRACK;
  const head:SummaryItem[]=[];
  if(slide.type==='framework'&&slide.kind==='SCORE'&&slide.summary.score!==null){
    head.push({label:'Điểm tự đánh giá',value:fmtNumber(slide.summary.score),of:slide.summary.maxScore!==null?fmtNumber(slide.summary.maxScore):undefined,tone:'info'});
  }else if(slide.type==='framework'&&slide.summary.progress!==null){
    head.push({label:'Tiến độ chung',value:`${slide.summary.progress}%`,tone:'info'});
  }
  const items:SummaryItem[]=[
    ...head,
    {label:'Đạt, đúng tiến độ',value:good,of:total,tone:toneIf(good,'ok')},
    {label:'Cần theo dõi',value:counts.AT_RISK,tone:toneIf(counts.AT_RISK,'warn')},
    {label:'Quá hạn',value:counts.OVERDUE,tone:toneIf(counts.OVERDUE,'bad')},
    ...tail,
  ];
  if(slide.type==='department'&&unassigned)items.push({label:'Chưa giao người',value:unassigned,tone:'warn'});
  return items;
}

/** Giá trị lớn ở góc ô: điểm/điểm tối đa, số liệu thống kê hoặc kết quả thực hiện kèm đơn vị ngắn. */
function tileValue(target:WallTarget):ReactNode{
  if(!target.hasReport)return '—';
  if(target.kind==='SCORE')return <>{fmtNumber(target.currentValue)}{target.maxScore!=null&&<small> /{fmtNumber(target.maxScore)}</small>}</>;
  if(target.unit==='%')return `${fmtNumber(target.currentValue)}%`;
  return <>{fmtNumber(target.currentValue)}{target.unit&&target.unit.length<=6&&<small> {target.unit}</small>}</>;
}

function tileGoal(target:WallTarget){
  if(target.kind==='STAT')return target.hasReport?`Cập nhật ${fmtDate(target.lastReportedAt)}`:target.groupName??'';
  if(target.kind==='SCORE')return target.hasReport?`Đạt ${target.progress}% số điểm`:target.targetText??'';
  return `Mục tiêu ${target.targetText||valueWithUnit(target.targetValue,target.unit)}`;
}

function Tile({target,context}:{target:WallTarget;context:Slide['type']}){
  const stat=target.kind==='STAT';
  const tone=stat?(target.hasReport?'ok':'neutral'):statusTone[target.status]??'neutral';
  const label=stat?(target.hasReport?'Đã có số liệu':'Chưa có số liệu'):statusMeta[target.status]?.label??target.status;
  const missing=target.missingPeriods;
  const showDepartment=context!=='department';
  // Việc bị treo không kèm lý do: đã có người phụ trách và không bị giải trình thì chỉ còn lý do chuyển, trả qua lại.
  const bounced=context==='stalled'&&Boolean(target.assigneeName)&&!target.explanationRequested;
  return <Link to={`/admin/targets/${target.id}${missing.length?'#thuc-hien':''}`} className={`wb-tile ${target.status}`} title={target.title}>
    <span className="t">{target.title}</span>
    <span className="v">{tileValue(target)}</span>
    <span className="d">
      {showDepartment&&<><span className="ioc-dept-dot" style={{'--dept':target.departmentColor} as CSSProperties} aria-hidden="true"/><span>{target.departmentName}</span></>}
      {target.assigneeName?<span>{showDepartment?'· ':''}{target.assigneeName}</span>
        :needsAssignee(target)?<span className="none">{showDepartment?'· ':''}Chưa giao người</span>:null}
    </span>
    <span className={`s ${tone}`}>{label}</span>
    <span className="f">
      {target.explanationRequested&&<span className="wb-flag bad"><MessageSquareWarning aria-hidden="true"/>Yêu cầu giải trình</span>}
      {bounced&&<span className="wb-flag bad"><Repeat2 aria-hidden="true"/>Chuyển, trả qua lại nhiều lần</span>}
      {missing.length>0&&<span className="wb-flag warn" title={`Thiếu báo cáo: ${missing.join(', ')}`}>
        <CalendarX aria-hidden="true"/>{missing.length===1?`Thiếu báo cáo ${missing[0]}`:`Thiếu ${missing.length} kỳ báo cáo`}
      </span>}
      <span className="goal">{tileGoal(target)}</span>
    </span>
    {!stat&&<span className="progress" aria-hidden="true"><i className={tone} style={{width:`${Math.max(0,Math.min(100,target.progress))}%`}}/></span>}
  </Link>;
}

function SlideHead({slide}:{slide:Slide}){
  const eyebrow=slide.type==='framework'?<>Bộ chỉ tiêu · {slide.kindLabel}</>
    :slide.type==='department'?<><span className="ioc-dept-dot" style={{'--dept':slide.color} as CSSProperties} aria-hidden="true"/>Theo phòng ban</>
    :<><TriangleAlert aria-hidden="true" width="1em" height="1em"/>Cần lãnh đạo xử lý</>;
  const description=slide.type==='framework'?(slide.legalBasis?`Căn cứ: ${slide.legalBasis}`:'')
    :slide.type==='department'?`${slide.targets.length} chỉ tiêu được giao (không gồm chỉ tiêu thống kê), xếp việc cần quan tâm lên trước`
    :'Chỉ tiêu bị chuyển, trả qua lại nhiều lần, chưa giao người phụ trách quá lâu hoặc quá hạn giải trình';
  return <div className="wb-slide-head">
    <div className="wb-title">
      <div className={`wb-eyebrow${slide.type==='stalled'?' bad':''}`}>{eyebrow}</div>
      <h1>{slide.title}</h1>
      {description&&<p>{description}</p>}
    </div>
    <div className="wb-summary">
      {summaryFor(slide).map(item=><div key={item.label} className={item.tone??''}>
        <strong>{item.value}{item.of!==undefined&&<small>/{item.of}</small>}</strong>
        <span>{item.label}</span>
      </div>)}
    </div>
  </div>;
}

function MoreLine({slide,hidden}:{slide:Slide;hidden:WallTarget[]}){
  if(!hidden.length)return <div className="wb-more"/>;
  const overdue=hidden.filter(target=>target.status==='OVERDUE').length;
  const atRisk=hidden.filter(target=>target.status==='AT_RISK').length;
  const notes=[overdue&&`${overdue} quá hạn`,atRisk&&`${atRisk} cần theo dõi`].filter(Boolean).join(', ');
  const link=slide.type==='framework'?`/admin/targets?frameworkId=${slide.id}`:slide.type==='department'?`/admin/targets?departmentId=${slide.id}`:'';
  return <div className="wb-more">
    <span>… và <strong>{hidden.length}</strong> chỉ tiêu khác</span>
    {notes&&<span className="bad">(trong đó {notes})</span>}
    {link&&<Link to={link}>Xem đầy đủ trong danh mục</Link>}
  </div>;
}

/** Đồng hồ giờ Việt Nam, tách riêng để chỉ phần này vẽ lại mỗi giây. */
function Clock(){
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    let timer=0;
    const tick=()=>{setNow(new Date());timer=window.setTimeout(tick,1000-Date.now()%1000)};
    timer=window.setTimeout(tick,1000-Date.now()%1000);
    return()=>window.clearTimeout(timer);
  },[]);
  const weekday=weekdayFormat.format(now);
  return <div className="wb-clock">
    <strong><time dateTime={now.toISOString()}>{timeFormat.format(now)}</time></strong>
    <small>{weekday.charAt(0).toUpperCase()+weekday.slice(1)}, {dayFormat.format(now)}</small>
  </div>;
}

function useMediaQuery(query:string){
  const [matches,setMatches]=useState(()=>window.matchMedia(query).matches);
  useEffect(()=>{
    const media=window.matchMedia(query);
    const update=()=>setMatches(media.matches);
    update();
    media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[query]);
  return matches;
}

/** Ước lượng số ô trước khi đo được: theo kích thước cửa sổ và bề rộng ô tối thiểu trong ioc.css. */
function estimateCapacity(){
  const minTile=window.innerWidth>=1800?380:320;
  const columns=Math.max(1,Math.floor((window.innerWidth-36)/(minTile+12)));
  const rows=Math.max(1,Math.floor((window.innerHeight-340)/(ESTIMATED_TILE+12)));
  return columns*rows;
}

/** Số ô vừa khung lưới: đo số cột thật và chiều cao ô, cập nhật khi đổi cỡ cửa sổ. Màn hình hẹp cuộn dọc nên hiện đủ. */
function useTileCapacity(gridRef:RefObject<HTMLDivElement|null>,slideKey:string,narrow:boolean){
  const [capacity,setCapacity]=useState(estimateCapacity);
  useLayoutEffect(()=>{
    const grid=gridRef.current;
    if(narrow||!grid)return;
    const measure=()=>{
      const style=getComputedStyle(grid);
      const columns=Math.max(1,style.gridTemplateColumns.split(' ').filter(Boolean).length);
      const gap=parseFloat(style.rowGap)||0;
      const tileHeight=Math.max(0,...[...grid.querySelectorAll<HTMLElement>('.wb-tile')].map(tile=>tile.offsetHeight))||ESTIMATED_TILE;
      setCapacity(columns*Math.max(1,Math.floor((grid.clientHeight+gap)/(tileHeight+gap))));
    };
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(grid);
    return()=>observer.disconnect();
  },[gridRef,slideKey,narrow]);
  return narrow?Number.POSITIVE_INFINITY:capacity;
}

export default function Wallboard(){
  const navigate=useNavigate();
  const fallbackLocality=useLocality();
  const narrow=useMediaQuery(NARROW_QUERY);
  const [data,setData]=useState<WallboardData|null>(null);
  const [loading,setLoading]=useState(true);
  const [retrying,setRetrying]=useState(false);
  const [error,setError]=useState('');
  const [activeKey,setActiveKey]=useState('');
  const [paused,setPaused]=useState(false);
  const [idle,setIdle]=useState(false);
  const [fullscreen,setFullscreen]=useState(()=>Boolean(document.fullscreenElement));
  const gridRef=useRef<HTMLDivElement>(null);
  const mounted=useRef(true);
  const lastIndex=useRef(0);
  const fullscreenExitAt=useRef(0);

  const load=useCallback(async()=>{
    try{
      const result=await api<WallboardData>('/ioc/wallboard');
      if(!mounted.current)return;
      setData(result);
      setError('');
    }catch(reason){
      if(mounted.current)setError(reason instanceof Error?reason.message:'Không tải được dữ liệu trình chiếu');
    }finally{
      if(mounted.current)setLoading(false);
    }
  },[]);

  useEffect(()=>{
    mounted.current=true;
    void load();
    const timer=window.setInterval(()=>void load(),REFRESH_MS);
    return()=>{mounted.current=false;window.clearInterval(timer)};
  },[load]);

  async function retry(){
    setRetrying(true);
    await load();
    if(mounted.current)setRetrying(false);
  }

  // Trang đang chiếu được nhớ theo khoá; nếu trang đó biến mất sau khi tải lại thì đứng ở vị trí cũ.
  const slides=useMemo(()=>data?buildSlides(data):[],[data]);
  const count=slides.length;
  const found=slides.findIndex(slide=>slide.key===activeKey);
  const index=found>=0?found:Math.min(lastIndex.current,Math.max(0,count-1));
  const slide=slides[index] as Slide|undefined;
  const slideKey=slide?.key??'';
  const seconds=Math.max(5,data?.rotateSeconds??20);

  const nav=useRef({slides,index});
  useLayoutEffect(()=>{
    nav.current={slides,index};
    lastIndex.current=index;
  });

  const goTo=useCallback((target:number)=>{
    const next=nav.current.slides[target];
    if(next)setActiveKey(next.key);
  },[]);
  const go=useCallback((delta:number)=>{
    const {slides:list,index:current}=nav.current;
    if(list.length>1)setActiveKey(list[(current+delta+list.length)%list.length].key);
  },[]);

  // Hẹn giờ chuyển trang; khi tạm dừng hoặc dữ liệu tải lại thì giữ phần thời gian đã chạy của trang hiện tại.
  const timing=useRef({key:'',used:0});
  useEffect(()=>{
    if(timing.current.key!==slideKey)timing.current={key:slideKey,used:0};
    if(paused||count<2)return;
    const started=Date.now();
    const timer=window.setTimeout(()=>go(1),Math.max(0,seconds*1000-timing.current.used));
    return()=>{
      window.clearTimeout(timer);
      timing.current.used+=Date.now()-started;
    };
  },[slideKey,paused,count,seconds,go]);

  useEffect(()=>{
    if(narrow&&window.scrollY>0)window.scrollTo({top:0});
  },[slideKey,narrow]);

  const toggleFullscreen=useCallback(()=>{
    if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);
    else if(document.fullscreenEnabled)void document.documentElement.requestFullscreen().catch(()=>undefined);
  },[]);

  useEffect(()=>{
    const sync=()=>{
      const active=Boolean(document.fullscreenElement);
      if(!active)fullscreenExitAt.current=Date.now();
      setFullscreen(active);
    };
    document.addEventListener('fullscreenchange',sync);
    return()=>{
      document.removeEventListener('fullscreenchange',sync);
      if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);
    };
  },[]);

  // Phím tắt: ←/→ (và PageUp/PageDown của bút trình chiếu), phím cách, F, Esc.
  useEffect(()=>{
    const isField=(target:EventTarget|null)=>target instanceof HTMLElement&&Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.ctrlKey||event.metaKey||event.altKey||isField(event.target))return;
      switch(event.key){
        case 'ArrowRight':case 'PageDown':
          event.preventDefault();go(1);break;
        case 'ArrowLeft':case 'PageUp':
          event.preventDefault();go(-1);break;
        case ' ':case 'Spacebar':
          event.preventDefault();
          if(!event.repeat)setPaused(value=>!value);
          break;
        case 'f':case 'F':
          event.preventDefault();toggleFullscreen();break;
        case 'Escape':
          // Esc đầu tiên trình duyệt dùng để thoát toàn màn hình; chỉ rời trang khi đang ở cửa sổ thường.
          if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);
          else if(Date.now()-fullscreenExitAt.current>600)navigate('/admin');
          break;
      }
    };
    // Chặn phím cách kích hoạt nút đang có tiêu điểm (đã dùng để tạm dừng).
    const onKeyUp=(event:KeyboardEvent)=>{if(event.key===' '&&!isField(event.target))event.preventDefault()};
    window.addEventListener('keydown',onKeyDown);
    window.addEventListener('keyup',onKeyUp);
    return()=>{window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp)};
  },[go,navigate,toggleFullscreen]);

  // Ẩn con trỏ và nút điều khiển khi chuột đứng yên 3 giây.
  useEffect(()=>{
    let timer=0;
    const wake=()=>{
      setIdle(false);
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>setIdle(true),IDLE_MS);
    };
    wake();
    window.addEventListener('mousemove',wake);
    window.addEventListener('pointerdown',wake);
    return()=>{window.clearTimeout(timer);window.removeEventListener('mousemove',wake);window.removeEventListener('pointerdown',wake)};
  },[]);

  // Giữ màn hình TV không tự tắt trong lúc trình chiếu (nếu trình duyệt hỗ trợ).
  useEffect(()=>{
    let lock:WakeLockSentinel|null=null;
    let active=true;
    const request=()=>{
      if(document.visibilityState!=='visible'||!('wakeLock' in navigator))return;
      navigator.wakeLock.request('screen').then(sentinel=>{if(active)lock=sentinel;else void sentinel.release()}).catch(()=>undefined);
    };
    request();
    document.addEventListener('visibilitychange',request);
    return()=>{active=false;document.removeEventListener('visibilitychange',request);void lock?.release().catch(()=>undefined)};
  },[]);

  const capacity=useTileCapacity(gridRef,slideKey,narrow);
  const locality=data?.locality??fallbackLocality;
  const canEditFrameworks=hasAnyRole(auth.user,FRAMEWORK_EDITOR_ROLES);
  const screenCode=screenCodeFor('/trinh-chieu');

  let body:ReactNode;
  if(!data&&loading){
    body=<div className="wb-body" role="status" aria-label="Đang tải dữ liệu trình chiếu">
      <div className="wb-slide-head">
        <div className="wb-title"><Skeleton className="wb-skel-eyebrow"/><Skeleton className="wb-skel-title"/></div>
        <div className="wb-summary">{Array.from({length:4},(_,item)=><Skeleton key={item} className="wb-skel-sum"/>)}</div>
      </div>
      <div className="wb-tiles">{Array.from({length:12},(_,item)=><Skeleton key={item} className="wb-skel-tile"/>)}</div>
      <div className="wb-more"/>
    </div>;
  }else if(!data){
    body=<div className="wb-body">
      <div className="wb-state bad" role="alert">
        <TriangleAlert aria-hidden="true"/>
        <h1>Không tải được dữ liệu trình chiếu</h1>
        <p>{error||'Máy chủ chưa phản hồi.'} Màn hình sẽ tự thử lại sau mỗi phút.</p>
        <div className="actions">
          <button type="button" className="btn primary lg" onClick={()=>void retry()} disabled={retrying}><RefreshCw aria-hidden="true"/>{retrying?'Đang thử lại…':'Thử lại'}</button>
          <button type="button" className="btn secondary lg" onClick={()=>navigate('/admin')}>Về trang quản trị</button>
        </div>
      </div>
    </div>;
  }else if(!slide){
    body=<div className="wb-body">
      <div className="wb-state">
        <MonitorPlay aria-hidden="true"/>
        <h1>Chưa có nội dung để trình chiếu</h1>
        <p>Vào <strong>Bộ chỉ tiêu</strong>, bật <strong>“Hiện trên trình chiếu”</strong> cho những bộ chỉ tiêu cần theo dõi trong cuộc họp giao ban.
          Phòng ban có chỉ tiêu được giao cũng sẽ tự xuất hiện tại đây.</p>
        {!canEditFrameworks&&<p>Đề nghị Văn thư hoặc Quản trị hệ thống bật trình chiếu cho bộ chỉ tiêu.</p>}
        <div className="actions">
          {canEditFrameworks&&<Link className="btn primary lg" to="/admin/bo-chi-tieu">Mở Bộ chỉ tiêu</Link>}
          <button type="button" className="btn secondary lg" onClick={()=>void retry()} disabled={retrying}><RefreshCw aria-hidden="true"/>{retrying?'Đang tải lại…':'Tải lại'}</button>
        </div>
      </div>
    </div>;
  }else{
    const visible=slide.targets.slice(0,capacity);
    const hidden=slide.targets.slice(visible.length);
    body=<section key={slide.key} className="wb-body" aria-roledescription="trang trình chiếu" aria-label={`Trang ${index+1} trên ${count}: ${slide.title}`}>
      <SlideHead slide={slide}/>
      <div className="wb-tiles" ref={gridRef}>
        {visible.map(target=><Tile key={target.id} target={target} context={slide.type}/>)}
      </div>
      <MoreLine slide={slide} hidden={hidden}/>
    </section>;
  }

  return <main className={`wb${paused?' paused':''}${idle?' idle':''}`} aria-label="Trình chiếu phòng họp">
    <header className="wb-top">
      <div className="wb-brand">
        <span className="mark" aria-hidden="true">{localityInitials(locality)}</span>
        <div><strong>{locality.brandName}</strong><small>{locality.agencyName}</small></div>
      </div>
      <Clock/>
      <div className="wb-controls">
        <button type="button" className="btn ghost icon sm" onClick={()=>go(-1)} disabled={count<2} aria-label="Trang trước" title="Trang trước (phím ←)"><ChevronLeft aria-hidden="true"/></button>
        <button type="button" className={`btn ghost icon sm${paused?' on':''}`} onClick={()=>setPaused(value=>!value)} disabled={count<2}
          aria-label={paused?'Tiếp tục trình chiếu':'Tạm dừng trình chiếu'} title={paused?'Tiếp tục (phím cách)':'Tạm dừng (phím cách)'}>
          {paused?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>}
        </button>
        <button type="button" className="btn ghost icon sm" onClick={()=>go(1)} disabled={count<2} aria-label="Trang sau" title="Trang sau (phím →)"><ChevronRight aria-hidden="true"/></button>
        {document.fullscreenEnabled&&<button type="button" className="btn ghost icon sm" onClick={toggleFullscreen}
          aria-label={fullscreen?'Thoát toàn màn hình':'Toàn màn hình'} title={fullscreen?'Thoát toàn màn hình (phím F)':'Toàn màn hình (phím F)'}>
          {fullscreen?<Minimize aria-hidden="true"/>:<Maximize aria-hidden="true"/>}
        </button>}
        <button type="button" className="btn ghost icon sm" onClick={()=>navigate('/admin')} aria-label="Thoát trình chiếu" title="Thoát trình chiếu (Esc)"><X aria-hidden="true"/></button>
      </div>
    </header>

    {body}

    <footer className="wb-foot">
      <span className="wb-code">{screenCode}</span>
      {data?<span>Dữ liệu lúc {fmtDateTime(data.generatedAt)} · Năm {data.year}</span>:<span>{loading?'Đang tải dữ liệu…':'Chưa có dữ liệu'}</span>}
      {data&&error&&<span className="wb-stale" role="status">Mất kết nối, đang hiển thị dữ liệu cũ</span>}
      {paused&&<span className="badge warn">Đang tạm dừng</span>}
      <span className="wb-keys">← → chuyển trang · Phím cách tạm dừng · F toàn màn hình · Esc thoát</span>
      <div className="wb-bar" aria-hidden="true">{count>1&&<i key={slideKey} style={{animationDuration:`${seconds}s`}}/>}</div>
      {count>1&&<div className="wb-dots" role="group" aria-label="Chọn trang trình chiếu">
        {slides.map((item,position)=><button key={item.key} type="button" className={position===index?'active':''}
          aria-label={`Trang ${position+1}: ${item.title}`} aria-current={position===index?'true':undefined} onClick={()=>goTo(position)}/>)}
      </div>}
      <span className="wb-count" aria-label={count?`Trang ${index+1} trên ${count}`:undefined}>{count?`${index+1}/${count}`:'0/0'}</span>
    </footer>
  </main>;
}
