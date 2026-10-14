import { ClipboardCheck, Pencil } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { fmtDateTime, fmtNumber } from '../../ioc-format';
import { evaluationLabels, type EvaluationResult } from '../../ioc-types';
import { toast } from '../Toast';
import { Badge, Empty } from '../UI';
import { EvidenceChips, periodLabel, periodsOfYear, type PartProps } from './shared';

type EvaluationItem=PartProps['d']['evaluations'][number];
const RESULTS:EvaluationResult[]=['EXCEEDED','ACHIEVED','PARTIAL','NOT_ACHIEVED'];

/** Phần 3 — Đánh giá theo kỳ: Vượt / Đạt / Đạt một phần / Không đạt; chưa đạt thì bắt buộc nêu nguyên nhân. */
export default function EvaluationPart({d,reload,fail}:PartProps){
  const [editing,setEditing]=useState<{periodKey:string;existing?:EvaluationItem}|null>(null);

  return <section className="panel" aria-labelledby="dos-evaluation-title">
    <div className="panel-head">
      <div>
        <h3 id="dos-evaluation-title">Đánh giá</h3>
        <p>Lãnh đạo hoặc trưởng phòng chủ trì đánh giá kết quả từng kỳ; chưa đạt phải nêu nguyên nhân và biện pháp khắc phục.</p>
      </div>
      {d.permissions.canEvaluate&&!editing&&<div className="dos-head-actions">
        <button type="button" className="btn primary sm" onClick={()=>setEditing({periodKey:d.currentPeriodKey})}><ClipboardCheck aria-hidden="true"/>Đánh giá kỳ</button>
      </div>}
    </div>

    {editing&&<EvaluationForm d={d} reload={reload} fail={fail} initial={editing} onClose={()=>setEditing(null)}/>}

    {d.evaluations.length
      ?d.evaluations.map(item=>{
        const meta=evaluationLabels[item.result];
        return <article key={item.id} className={`dos-entry dos-evaluation ${meta.tone}`}>
          <header>
            <strong>{item.periodLabel||periodLabel(item.periodKey)}</strong>
            <Badge tone={meta.tone}>{item.resultLabel||meta.label}</Badge>
            {item.score!==null&&item.score!==undefined&&<span className="dos-muted">{fmtNumber(item.score)} điểm</span>}
            <span className="right">
              {d.permissions.canEvaluate&&!editing&&<button type="button" className="btn ghost sm" onClick={()=>setEditing({periodKey:item.periodKey,existing:item})}><Pencil aria-hidden="true"/>Sửa</button>}
            </span>
          </header>
          {item.note&&<p className="dos-note"><b>{item.result==='ACHIEVED'||item.result==='EXCEEDED'?'Nhận xét':'Nguyên nhân'}:</b> {item.note}</p>}
          {item.correctiveAction&&<p className="dos-note"><b>Biện pháp khắc phục:</b> {item.correctiveAction}</p>}
          <EvidenceChips targetId={d.id} items={item.evidences.map(evidence=>({...evidence,createdAt:item.evaluatedAt}))}/>
          <div className="meta">Đánh giá bởi {item.evaluatedByName} · {fmtDateTime(item.evaluatedAt)}</div>
        </article>;
      })
      :!editing&&<Empty
        title="Chưa có đánh giá"
        description={d.permissions.canEvaluate?'Đánh giá kết quả kỳ để khép lại hồ sơ: đạt hay chưa, vì sao, khắc phục thế nào.':'Lãnh đạo hoặc trưởng phòng chủ trì chưa đánh giá chỉ tiêu này.'}
      />}
  </section>;
}

function EvaluationForm({d,reload,fail,initial,onClose}:Pick<PartProps,'d'|'reload'|'fail'>&{initial:{periodKey:string;existing?:EvaluationItem};onClose:()=>void}){
  const periods=useMemo(()=>periodsOfYear(d.frequency,d.year),[d.frequency,d.year]);
  const [periodKey,setPeriodKey]=useState(periods.includes(initial.periodKey)?initial.periodKey:periods[periods.length-1]);
  const existing=initial.existing?.periodKey===periodKey?initial.existing:d.evaluations.find(item=>item.periodKey===periodKey);
  const [result,setResult]=useState<EvaluationResult>(existing?.result??'ACHIEVED');
  const [score,setScore]=useState(existing?.score!==null&&existing?.score!==undefined?String(existing.score):'');
  const [note,setNote]=useState(existing?.note??'');
  const [correctiveAction,setCorrectiveAction]=useState(existing?.correctiveAction??'');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const notMet=result==='PARTIAL'||result==='NOT_ACHIEVED';
  const maxScore=d.maxScore??null;

  function choosePeriod(key:string){
    setPeriodKey(key);
    const found=d.evaluations.find(item=>item.periodKey===key);
    setResult(found?.result??'ACHIEVED');
    setScore(found?.score!==null&&found?.score!==undefined?String(found.score):'');
    setNote(found?.note??'');
    setCorrectiveAction(found?.correctiveAction??'');
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    if(notMet&&!note.trim()){setError('Chỉ tiêu chưa đạt phải nêu nguyên nhân.');return}
    const scoreValue=score.trim()===''?undefined:Number(score.replace(',','.'));
    if(scoreValue!==undefined&&(!Number.isFinite(scoreValue)||scoreValue<0)){setError('Điểm phải là số không âm.');return}
    if(scoreValue!==undefined&&maxScore!==null&&scoreValue>maxScore){setError(`Điểm không được vượt quá ${fmtNumber(maxScore)}.`);return}
    setBusy(true);setError('');
    try{
      await api(`/targets/${encodeURIComponent(d.id)}/evaluations`,{method:'POST',body:JSON.stringify({
        periodKey,result,score:scoreValue,note:note.trim()||undefined,correctiveAction:correctiveAction.trim()||undefined,
        expectedVersion:existing?.version,
      })});
      toast.ok('Đã lưu đánh giá',`${periodLabel(periodKey)}: ${evaluationLabels[result].label}`);
      onClose();
      await reload();
    }catch(caught){setError(fail(caught,'Không lưu được đánh giá'))}
    finally{setBusy(false)}
  }

  return <form className="dos-form" onSubmit={submit} noValidate aria-label="Đánh giá kết quả kỳ">
    <div className="dos-form-title">
      <strong>{existing?'Sửa đánh giá':'Đánh giá kết quả'}</strong>
      <span>Kết quả được báo cho trưởng phòng và người phụ trách; chưa đạt thì ghi rõ nguyên nhân và biện pháp.</span>
    </div>
    <div className="form-grid two">
      <label>Kỳ đánh giá
        <select value={periodKey} onChange={event=>choosePeriod(event.target.value)}>
          {periods.map(key=><option key={key} value={key}>{periodLabel(key)}{d.evaluations.some(item=>item.periodKey===key)?' — đã đánh giá':''}</option>)}
        </select>
      </label>
      {d.kind==='SCORE'&&<label>Điểm{maxScore!==null?` (tối đa ${fmtNumber(maxScore)})`:''}
        <input type="number" inputMode="decimal" min={0} max={maxScore??undefined} step="any" value={score} onChange={event=>setScore(event.target.value)}/>
      </label>}
      <fieldset className="full dos-results">
        <legend>Kết quả</legend>
        {RESULTS.map(key=><label key={key} className={`chip ${result===key?'active':''}`}>
          <input type="radio" name="evaluation-result" value={key} checked={result===key} onChange={()=>setResult(key)}/>
          {evaluationLabels[key].label}
        </label>)}
      </fieldset>
      <label className="full">{notMet?<>Nguyên nhân chưa đạt <span className="dos-req">(bắt buộc)</span></>:'Nhận xét'}
        <textarea rows={3} value={note} maxLength={2000} onChange={event=>setNote(event.target.value)} aria-invalid={notMet&&!note.trim()?true:undefined}/>
      </label>
      <label className="full">Biện pháp khắc phục{notMet?'':' (nếu có)'}
        <textarea rows={2} value={correctiveAction} maxLength={2000} onChange={event=>setCorrectiveAction(event.target.value)}/>
      </label>
    </div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <div className="row">
      <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Huỷ</button>
      <button type="submit" className="btn primary" disabled={busy}>{busy?'Đang lưu…':'Lưu đánh giá'}</button>
    </div>
  </form>;
}
