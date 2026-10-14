import { AlertTriangle, ClipboardCheck, FileText, LineChart, SearchX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, auth } from '../api';
import DirectivesPart from '../components/dossier/DirectivesPart';
import DossierHeader from '../components/dossier/DossierHeader';
import EvaluationPart from '../components/dossier/EvaluationPart';
import ExecutionPart from '../components/dossier/ExecutionPart';
import { errorText, type DossierData, type PartProps } from '../components/dossier/shared';
import SidePanel from '../components/dossier/SidePanel';
import { toast } from '../components/Toast';
import { Skeleton, SkeletonText, StateCard } from '../components/UI';
import '../styles/ioc-dossier.css';

type Part='chi-dao'|'thuc-hien'|'danh-gia';
const PARTS:{key:Part;label:string;hint:string;icon:typeof FileText;done:(d:DossierData)=>boolean}[]=[
  {key:'chi-dao',label:'Chỉ đạo điều hành',hint:'Văn bản làm căn cứ',icon:FileText,done:d=>d.completeness.directive},
  {key:'thuc-hien',label:'Thực hiện',hint:'Số liệu, nguồn, minh chứng',icon:LineChart,done:d=>d.completeness.execution},
  {key:'danh-gia',label:'Đánh giá',hint:'Đạt hay chưa, vì sao',icon:ClipboardCheck,done:d=>d.completeness.evaluation},
];

function partFromHash(hash:string):Part{
  const key=hash.replace('#','');
  return PARTS.some(part=>part.key===key)?key as Part:'thuc-hien';
}

/** Hồ sơ chỉ tiêu ba phần (CT-06): chỉ đạo điều hành – thực hiện – đánh giá, kèm trách nhiệm và nguồn số liệu. */
export default function TargetDossier(){
  const {id=''}=useParams();
  const location=useLocation();
  const navigate=useNavigate();
  const me=auth.user;
  const [data,setData]=useState<DossierData|null>(null);
  const [error,setError]=useState<{status:number;message:string}|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const part=partFromHash(location.hash);
  const active=useRef(true);

  const load=useCallback(async(silent=false)=>{
    if(silent)setRefreshing(true);else setLoading(true);
    try{
      const result=await api<DossierData>(`/targets/${encodeURIComponent(id)}/dossier`);
      if(!active.current)return null;
      setData(result);setError(null);
      return result;
    }catch(caught){
      if(!active.current)return null;
      if(!silent||!data)setError({status:caught instanceof ApiError?caught.status:0,message:errorText(caught,'Không tải được hồ sơ chỉ tiêu')});
      else toast.error('Không tải lại được hồ sơ',errorText(caught));
      return null;
    }finally{
      if(active.current){setLoading(false);setRefreshing(false)}
    }
  },[id,data]);

  useEffect(()=>{
    active.current=true;
    setData(null);
    void load();
    return()=>{active.current=false};
    // Chỉ tải lại khi đổi chỉ tiêu; `load` thay đổi theo dữ liệu nên không đưa vào phụ thuộc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[id]);

  const reload=useCallback(()=>load(true),[load]);
  const fail=useCallback((caught:unknown,title:string)=>{
    const message=errorText(caught,title);
    if(caught instanceof ApiError&&caught.status===409){
      toast.warn('Dữ liệu vừa thay đổi','Hồ sơ đã được tải lại, vui lòng kiểm tra rồi thao tác lại.');
      void load(true);
    }else toast.error(title,message);
    return message;
  },[load]);

  if(!me)return null;
  if(loading&&!data)return <div className="dos-loading" role="status" aria-label="Đang tải hồ sơ chỉ tiêu">
    <Skeleton className="skeleton-title" style={{width:'min(640px, 90%)'}}/>
    <SkeletonText lines={2}/>
    <div className="dos-figures">{[0,1,2,3].map(index=><Skeleton key={index} style={{height:84}}/>)}</div>
    <Skeleton style={{height:320}}/>
  </div>;
  if(error||!data){
    const missing=error?.status===404||error?.status===403;
    return <StateCard
      icon={missing?<SearchX/>:<AlertTriangle/>}
      title={missing?'Không tìm thấy chỉ tiêu hoặc bạn không có quyền xem':'Không tải được hồ sơ chỉ tiêu'}
      description={missing?'Chỉ tiêu có thể đã bị xoá, hoặc thuộc phòng ban ngoài phạm vi của bạn.':error?.message??''}
      action={missing
        ?<Link className="btn secondary" to="/admin/targets">Về danh mục chỉ tiêu</Link>
        :<button type="button" className="btn primary" onClick={()=>void load()}>Thử lại</button>}
    />;
  }

  const props:PartProps={d:data,me,reload,fail};
  return <div className="dossier">
    <DossierHeader d={data} refreshing={refreshing} onRefresh={()=>void reload()}/>
    <div className="dos-parts" role="tablist" aria-label="Ba phần hồ sơ chỉ tiêu">
      {PARTS.map((item,index)=>{
        const done=item.done(data);
        return <button key={item.key} type="button" role="tab" id={`dos-tab-${item.key}`} aria-selected={part===item.key} aria-controls="dos-part-panel"
          className={`dos-part-tab ${part===item.key?'active':''} ${done?'done':''}`}
          onClick={()=>navigate({hash:item.key},{replace:true})}>
          <span className="num" aria-hidden="true">{index+1}</span>
          <span><strong>{item.label}</strong><small>{done?'Đã có':'Còn thiếu'} · {item.hint}</small></span>
        </button>;
      })}
    </div>
    <div className="dos-layout">
      <div id="dos-part-panel" role="tabpanel" aria-labelledby={`dos-tab-${part}`}>
        {part==='chi-dao'&&<DirectivesPart {...props}/>}
        {part==='thuc-hien'&&<ExecutionPart {...props}/>}
        {part==='danh-gia'&&<EvaluationPart {...props}/>}
      </div>
      <SidePanel {...props}/>
    </div>
  </div>;
}
