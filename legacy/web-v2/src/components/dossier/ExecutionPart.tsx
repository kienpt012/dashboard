import { AlertTriangle, Calculator, Check, CheckCircle2, CircleDashed, Clock3, Database, Link2, Plus, Send, X } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { APPROVAL_ROLES, hasAnyRole, isGlobal } from '../../authz';
import { fmtDate, fmtDateTime, fmtNumber, valueWithUnit } from '../../ioc-format';
import { toast } from '../Toast';
import { Badge, Empty } from '../UI';
import ReportForm from './ReportForm';
import { EvidenceChips, type DossierReport, type PartProps } from './shared';

const reviewMeta:Record<DossierReport['reviewStatus'],{label:string;tone:'ok'|'warn'|'bad'}>={
  PENDING:{label:'Chờ duyệt',tone:'warn'},
  APPROVED:{label:'Đã duyệt',tone:'ok'},
  REJECTED:{label:'Bị trả lại',tone:'bad'},
};

/** Phần 2 — Thực hiện: kỳ báo cáo, số liệu (nhập tay / tự tính / tổng hợp từ con), lịch sử báo cáo và minh chứng. */
export default function ExecutionPart(props:PartProps){
  const {d,me}=props;
  const [reporting,setReporting]=useState(false);
  const [presetPeriod,setPresetPeriod]=useState<string|undefined>();
  const manual=d.valueSource==='MANUAL';

  function startReport(periodKey?:string){
    setPresetPeriod(periodKey);
    setReporting(true);
  }

  return <section className="panel" aria-labelledby="dos-execution-title">
    <div className="panel-head">
      <div>
        <h3 id="dos-execution-title">Thực hiện</h3>
        <p>{manual
          ?'Số liệu theo từng kỳ, nguồn số liệu, giải trình khi chưa đạt và minh chứng kèm theo.'
          :d.valueSource==='COMPUTED'
            ?'Số liệu tự tính từ kho dữ liệu — không nhập tay. Muốn đổi số, cập nhật bảng dữ liệu nguồn.'
            :'Số liệu tổng hợp từ các chỉ tiêu con — báo cáo ở từng chỉ tiêu con.'}</p>
      </div>
      {manual&&d.permissions.canReport&&!reporting&&<div className="dos-head-actions">
        <button type="button" className="btn primary sm" onClick={()=>startReport()}><Send aria-hidden="true"/>Báo cáo số liệu</button>
      </div>}
    </div>

    {manual&&d.periods.length>0&&<PeriodStrip d={d} canReport={d.permissions.canReport} onPick={startReport}/>}
    {manual&&reporting&&<ReportForm {...props} presetPeriod={presetPeriod} onClose={()=>setReporting(false)}/>}
    {d.valueSource==='COMPUTED'&&<FormulaCard d={d}/>}
    {d.children.length>0&&<ChildrenTable d={d}/>}

    <h4 className="dos-subtitle">Lịch sử báo cáo</h4>
    {d.reports.length
      ?d.reports.map(report=><ReportEntry key={report.id} {...props} report={report}/>)
      :<Empty
        title="Chưa có báo cáo"
        description={manual
          ?(d.permissions.canReport?'Chọn "Báo cáo số liệu" để gửi số liệu kỳ đầu tiên kèm nguồn và minh chứng.':'Người phụ trách chưa gửi báo cáo nào cho chỉ tiêu này.')
          :'Hệ thống chưa ghi nhận số liệu nào.'}
      />}

    <GeneralEvidence {...props}/>
    {!hasAnyRole(me,APPROVAL_ROLES)&&d.reports.some(report=>report.reviewStatus==='PENDING')&&<p className="field-hint dos-gap">
      <Clock3 aria-hidden="true"/> Báo cáo chờ duyệt quá thời hạn quy định sẽ được hệ thống tự thông qua và ghi trách nhiệm cho người duyệt.
    </p>}
  </section>;
}

/** Dải kỳ báo cáo: đã báo cáo / quá hạn / chưa đến hạn; bấm kỳ thiếu để báo cáo đúng kỳ đó. */
function PeriodStrip({d,canReport,onPick}:{d:PartProps['d'];canReport:boolean;onPick:(key:string)=>void}){
  const missing=d.periods.filter(period=>period.overdue&&!period.reported).length;
  return <div className="dos-period-block">
    <div className="dos-periods" role="list" aria-label="Các kỳ báo cáo trong năm">
      {d.periods.map(period=>{
        const state=period.reported?'reported':period.overdue?'overdue':'';
        const icon=period.reported?<CheckCircle2 aria-hidden="true"/>:period.overdue?<AlertTriangle aria-hidden="true"/>:<CircleDashed aria-hidden="true"/>;
        const title=`${period.label}: ${period.reported?'đã báo cáo':period.overdue?`quá hạn từ ${fmtDate(period.deadline)}`:`hạn ${fmtDate(period.deadline)}`}`;
        return canReport&&!period.reported
          ?<button key={period.key} type="button" role="listitem" className={`dos-period ${state}`} title={`${title} — bấm để báo cáo`} onClick={()=>onPick(period.key)}>{icon}{period.label}</button>
          :<span key={period.key} role="listitem" className={`dos-period ${state}`} title={title}>{icon}{period.label}</span>;
      })}
    </div>
    {missing>0&&<p className="dos-warn-hint">{missing} kỳ đã quá hạn mà chưa có báo cáo (hạn ngày {d.reportDueDay??20} tháng cuối kỳ).</p>}
  </div>;
}

/** Thẻ công thức: cách tính bằng lời, kết quả, dấu vết từng bảng dữ liệu. */
function FormulaCard({d}:{d:PartProps['d']}){
  const formula=d.formula;
  if(!formula)return <div className="notice warn dos-gap"><AlertTriangle aria-hidden="true"/><p>Chưa đọc được công thức tự tính của chỉ tiêu này. Liên hệ quản trị để kiểm tra cấu hình.</p></div>;
  const {result}=formula;
  return <div className="dos-formula">
    <strong><Calculator aria-hidden="true"/> Cách tính</strong>
    <code>{formula.text}</code>
    <div className="dos-formula-result">
      <span>Kết quả: <b>{result.value===null?'chưa tính được':valueWithUnit(result.value,d.unit)}</b></span>
      {result.score!==null&&<span>Điểm: <b>{fmtNumber(result.score)}{d.maxScore?` / ${fmtNumber(d.maxScore)}`:''}</b></span>}
      {d.computedAt&&<span>Tính lúc {fmtDateTime(d.computedAt)}</span>}
    </div>
    {result.traces.length>0&&<ul>
      {result.traces.map((trace,index)=>{
        const dataset=formula.datasets.find(item=>item.code===trace.dataset);
        return <li key={`${trace.dataset}-${index}`}>
          <Database aria-hidden="true"/> {dataset?<Link to={`/admin/kho-du-lieu?code=${encodeURIComponent(trace.dataset)}`}>{dataset.name}</Link>:trace.dataset}
          {' · '}{aggLabel(trace.agg)}{trace.column?` cột ${trace.column}`:''}: {fmtNumber(trace.matched)}/{fmtNumber(trace.total)} dòng khớp điều kiện
          {trace.value!==null?` → ${fmtNumber(trace.value)}`:''}
        </li>;
      })}
    </ul>}
    {result.warnings.map(warning=><p key={warning} className="dos-warn-hint"><AlertTriangle aria-hidden="true"/> {warning}</p>)}
  </div>;
}

function aggLabel(agg:string){
  return ({count:'Đếm',sum:'Tổng',avg:'Trung bình',min:'Nhỏ nhất',max:'Lớn nhất',countDistinct:'Đếm giá trị khác nhau'} as Record<string,string>)[agg]??agg;
}

function ChildrenTable({d}:{d:PartProps['d']}){
  return <div className="dos-children-wrap">
    <h4 className="dos-subtitle">Chỉ tiêu con ({d.children.length})</h4>
    <div className="table-wrap">
      <table className="dos-children">
        <thead><tr>
          <th scope="col">Chỉ tiêu</th>
          <th scope="col">Phòng · người phụ trách</th>
          <th scope="col" className="ioc-num">Giao</th>
          <th scope="col" className="ioc-num">Thực hiện</th>
        </tr></thead>
        <tbody>
          {d.children.map(child=><tr key={child.id}>
            <td>
              <Link className="title" to={`/admin/targets/${child.id}`}>{child.standardCode||child.ordinal?<span className="ioc-code">{child.standardCode||child.ordinal} </span>:null}{child.title}</Link>
            </td>
            <td>
              <span className="dos-dept"><span className="ioc-dept-dot" style={{'--dept':child.department.color} as CSSProperties} aria-hidden="true"/>{child.department.name}</span>
              <small className="dos-muted">{child.assignee?.fullName??'Chưa giao người'}</small>
            </td>
            <td className="ioc-num">{child.kind==='SCORE'?`${fmtNumber(child.maxScore??child.targetValue)} điểm`:child.targetText||valueWithUnit(child.targetValue,child.unit)}</td>
            <td className="ioc-num">{child.lastReportedAt?(child.kind==='SCORE'?`${fmtNumber(child.currentValue)} điểm`:valueWithUnit(child.currentValue,child.unit)):<span className="dos-muted">Chưa có</span>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

/** Một báo cáo trong lịch sử; người có quyền duyệt có thể duyệt/trả lại ngay tại đây. */
function ReportEntry({d,me,reload,fail,report}:PartProps&{report:DossierReport}){
  const [mode,setMode]=useState<'idle'|'reject'>('idle');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const meta=reviewMeta[report.reviewStatus];
  const sameScope=isGlobal(me)||me.departmentId===d.department.id;
  const canReview=report.reviewStatus==='PENDING'&&hasAnyRole(me,APPROVAL_ROLES)&&sameScope&&report.user.id!==me.id&&!d.isArchived;

  async function review(decision:'APPROVE'|'REJECT'){
    if(decision==='REJECT'&&!note.trim()){setError('Vui lòng ghi rõ lý do trả lại để người báo cáo sửa.');return}
    setBusy(true);setError('');
    try{
      await api(`/targets/updates/${encodeURIComponent(report.id)}/review`,{method:'PATCH',body:JSON.stringify({decision,reviewNote:note.trim()||undefined})});
      toast.ok(decision==='APPROVE'?'Đã duyệt báo cáo':'Đã trả lại báo cáo',`${report.periodLabel??''} — ${report.user.fullName}`);
      setMode('idle');setNote('');
      await reload();
    }catch(caught){setError(fail(caught,'Không xử lý được báo cáo'))}
    finally{setBusy(false)}
  }

  return <article className={`dos-entry dos-report ${report.reviewStatus.toLowerCase()}`}>
    <header>
      <span className="value">{report.valueText||valueWithUnit(report.value,d.unit)}</span>
      {report.periodLabel&&<strong>{report.periodLabel}</strong>}
      <span className="right">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {report.autoApproved&&<Badge tone="warn">Tự thông qua</Badge>}
      </span>
    </header>
    {report.valueText&&<div className="meta">Giá trị số: {valueWithUnit(report.value,d.unit)}</div>}
    {report.dataSource&&<div className="meta">Nguồn số liệu: {report.dataSource}</div>}
    {report.explanation&&<p className="dos-note"><b>Giải trình:</b> {report.explanation}</p>}
    {report.note&&<p className="dos-note">{report.note}</p>}
    <EvidenceChips targetId={d.id} items={report.evidences}/>
    <div className="meta">
      Gửi bởi {report.user.fullName} · {fmtDateTime(report.createdAt)}
      {report.reviewStatus!=='PENDING'&&(report.autoApproved
        ?` · Hệ thống tự thông qua${report.reviewedAt?` lúc ${fmtDateTime(report.reviewedAt)}`:''} vì người duyệt không xử lý trong thời hạn`
        :report.reviewerName?` · ${report.reviewStatus==='APPROVED'?'Duyệt':'Trả lại'} bởi ${report.reviewerName}${report.reviewedAt?` lúc ${fmtDateTime(report.reviewedAt)}`:''}`:'')}
    </div>
    {report.reviewStatus==='REJECTED'&&report.reviewNote&&<p className="dos-note dos-bad-note"><b>Lý do trả lại:</b> {report.reviewNote}</p>}

    {canReview&&<div className="dos-review">
      {mode==='reject'&&<label>Lý do trả lại (bắt buộc)
        <textarea rows={2} value={note} maxLength={2000} onChange={event=>setNote(event.target.value)} autoFocus/>
      </label>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="row">
        {mode==='reject'
          ?<>
            <button type="button" className="btn secondary sm" disabled={busy} onClick={()=>{setMode('idle');setError('')}}>Huỷ</button>
            <button type="button" className="btn danger sm" disabled={busy} onClick={()=>void review('REJECT')}><X aria-hidden="true"/>{busy?'Đang gửi…':'Trả lại báo cáo'}</button>
          </>
          :<>
            <button type="button" className="btn secondary sm" disabled={busy} onClick={()=>setMode('reject')}><X aria-hidden="true"/>Trả lại</button>
            <button type="button" className="btn primary sm" disabled={busy} onClick={()=>void review('APPROVE')}><Check aria-hidden="true"/>{busy?'Đang duyệt…':'Duyệt số liệu'}</button>
          </>}
      </div>
    </div>}
  </article>;
}

/** Minh chứng chung của chỉ tiêu (không gắn với một báo cáo cụ thể) và thêm liên kết minh chứng. */
function GeneralEvidence({d,reload,fail}:PartProps){
  const [adding,setAdding]=useState(false);
  const [title,setTitle]=useState('');
  const [url,setUrl]=useState('');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function submit(event:FormEvent){
    event.preventDefault();
    if(title.trim().length<3){setError('Tên minh chứng phải có ít nhất 3 ký tự.');return}
    if(!/^https?:\/\/\S{3,}$/.test(url.trim())){setError('Đường dẫn phải bắt đầu bằng http:// hoặc https://');return}
    setBusy(true);setError('');
    try{
      await api(`/targets/${encodeURIComponent(d.id)}/evidence`,{method:'POST',body:JSON.stringify({kind:'LINK',title:title.trim(),url:url.trim(),note:note.trim()||undefined})});
      toast.ok('Đã thêm minh chứng',title.trim());
      setAdding(false);setTitle('');setUrl('');setNote('');
      await reload();
    }catch(caught){setError(fail(caught,'Không thêm được minh chứng'))}
    finally{setBusy(false)}
  }

  if(!d.evidences.length&&!d.permissions.canContribute)return null;
  return <div className="dos-general-evidence">
    <div className="dos-subtitle-row">
      <h4 className="dos-subtitle">Minh chứng chung</h4>
      {d.permissions.canContribute&&!adding&&<button type="button" className="btn ghost sm" onClick={()=>setAdding(true)}><Plus aria-hidden="true"/>Thêm liên kết</button>}
    </div>
    {adding&&<form className="dos-form" onSubmit={submit} noValidate aria-label="Thêm liên kết minh chứng">
      <div className="form-grid two">
        <label>Tên minh chứng<input type="text" value={title} maxLength={300} onChange={event=>setTitle(event.target.value)} placeholder="Ví dụ: Tin bài trên trang thông tin điện tử"/></label>
        <label>Đường dẫn<input type="url" value={url} maxLength={1000} onChange={event=>setUrl(event.target.value)} placeholder="https://"/></label>
        <label className="full">Ghi chú<input type="text" value={note} maxLength={1000} onChange={event=>setNote(event.target.value)}/></label>
      </div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="row">
        <button type="button" className="btn secondary" disabled={busy} onClick={()=>{setAdding(false);setError('')}}>Huỷ</button>
        <button type="submit" className="btn primary" disabled={busy}><Link2 aria-hidden="true"/>{busy?'Đang lưu…':'Thêm minh chứng'}</button>
      </div>
    </form>}
    <EvidenceChips targetId={d.id} items={d.evidences} empty={!adding?<p className="dos-muted">Chưa có minh chứng chung. Tệp minh chứng gắn với từng báo cáo được đính kèm khi gửi báo cáo.</p>:null}/>
  </div>;
}
