import { Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { hasAnyRole, LEADERSHIP_ROLES } from '../../authz';
import { fmtDate, valueWithUnit } from '../../ioc-format';
import { toast } from '../Toast';
import { defaultReportPeriod, EvidenceFileInput, uploadEvidenceFiles, type PartProps } from './shared';

type ProgressResponse={reviewStatus:'PENDING'|'APPROVED';message?:string;update?:{id:string}};

/**
 * Báo cáo số liệu một kỳ (POST /targets/:id/progress). Lãnh đạo ghi nhận ngay; người khác gửi chờ trưởng phòng duyệt
 * và phải nêu nguồn số liệu hoặc ghi chú. Tệp minh chứng được tải lên sau khi báo cáo được tạo, gắn vào đúng báo cáo.
 */
export default function ReportForm({d,me,reload,fail,presetPeriod,onClose}:PartProps&{presetPeriod?:string;onClose:()=>void}){
  const isLeader=hasAnyRole(me,LEADERSHIP_ROLES);
  const [periodKey,setPeriodKey]=useState(()=>presetPeriod||defaultReportPeriod(d));
  const [value,setValue]=useState('');
  const [valueText,setValueText]=useState('');
  const [dataSource,setDataSource]=useState('');
  const [explanation,setExplanation]=useState('');
  const [note,setNote]=useState('');
  const [files,setFiles]=useState<File[]>([]);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);

  useEffect(()=>{if(presetPeriod)setPeriodKey(presetPeriod)},[presetPeriod]);

  const period=d.periods.find(item=>item.key===periodKey);
  const numeric=value.trim()===''?null:Number(value.trim().replace(',','.'));
  const validNumber=numeric!==null&&Number.isFinite(numeric)&&numeric>=0;
  const reachesTarget=validNumber&&d.kind!=='STAT'&&(d.direction==='LOWER_IS_BETTER'?numeric<=d.targetValue:numeric>=d.targetValue);
  // Nhắc giải trình khi chỉ tiêu đang cần theo dõi/quá hạn mà số mới vẫn chưa đạt, hoặc khi nộp muộn so với hạn kỳ.
  const lateReport=Boolean(period?.overdue&&!period.reported);
  const behind=d.kind!=='STAT'&&!reachesTarget&&(d.status==='AT_RISK'||d.status==='OVERDUE');
  const needsExplanation=behind||lateReport;
  const myPending=!isLeader&&d.reports.some(report=>report.user.id===me.id&&report.reviewStatus==='PENDING');

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!periodKey){setError('Vui lòng chọn kỳ báo cáo.');return}
    if(!validNumber){setError('Vui lòng nhập giá trị thực hiện là một số không âm.');return}
    if(!isLeader&&!dataSource.trim()&&!note.trim()){setError('Vui lòng ghi rõ nguồn số liệu hoặc ghi chú cho báo cáo.');return}
    if(needsExplanation&&!explanation.trim()){
      setError(lateReport?'Kỳ này đã quá hạn báo cáo: vui lòng nêu lý do nộp muộn trong ô Giải trình.':'Chỉ tiêu đang chậm tiến độ: vui lòng giải trình nguyên nhân và hướng khắc phục.');
      return;
    }
    setSaving(true);
    setError('');
    try{
      const result=await api<ProgressResponse>(`/targets/${encodeURIComponent(d.id)}/progress`,{method:'POST',body:JSON.stringify({
        value:numeric,
        valueText:valueText.trim()||undefined,
        periodKey,
        dataSource:dataSource.trim()||undefined,
        explanation:explanation.trim()||undefined,
        note:note.trim()||undefined,
        baseVersion:d.version,
      })});
      let failures:string[]=[];
      if(files.length){
        // Lãnh đạo cập nhật trực tiếp không nhận lại mã báo cáo: tìm báo cáo vừa tạo trong hồ sơ mới.
        let updateId=result?.update?.id;
        if(!updateId){
          const fresh=await reload();
          updateId=fresh?.reports.find(report=>report.user.id===me.id&&report.periodKey===periodKey)?.id;
        }
        failures=await uploadEvidenceFiles(d.id,files,updateId?{progressUpdateId:updateId}:{});
      }
      if(result?.reviewStatus==='PENDING')toast.ok('Đã gửi báo cáo',result.message||'Báo cáo đang chờ trưởng phòng duyệt.');
      else toast.ok('Đã ghi nhận số liệu chính thức',`${valueWithUnit(numeric,d.unit)} — ${period?.label??periodKey}`);
      if(failures.length)toast.warn('Chưa tải được một số minh chứng',failures.join(' '));
      onClose();
      await reload();
    }catch(caught){setError(fail(caught,'Không gửi được báo cáo'))}
    finally{setSaving(false)}
  }

  if(myPending){
    return <div className="notice warn dos-gap" role="status">
      <p>Bạn đã có một báo cáo đang chờ duyệt cho chỉ tiêu này. Khi trưởng phòng duyệt hoặc trả lại, bạn có thể gửi báo cáo mới.</p>
    </div>;
  }

  return <form className="dos-form" onSubmit={submit} noValidate aria-label="Báo cáo số liệu">
    <div className="dos-form-title">
      <strong>Báo cáo số liệu</strong>
      <span>{isLeader?'Số liệu do lãnh đạo nhập được ghi nhận chính thức ngay.':'Báo cáo sẽ chờ trưởng phòng duyệt trước khi thành số liệu chính thức.'}</span>
    </div>
    <div className="form-grid two">
      <label>Kỳ báo cáo
        <select value={periodKey} onChange={event=>setPeriodKey(event.target.value)}>
          {d.periods.map(item=><option key={item.key} value={item.key}>
            {item.label} — {item.reported?'đã báo cáo (bổ sung, điều chỉnh)':item.overdue?`quá hạn từ ${fmtDate(item.deadline)}`:`hạn ${fmtDate(item.deadline)}`}
          </option>)}
        </select>
      </label>
      <label>Giá trị thực hiện ({d.unit})
        <input type="number" inputMode="decimal" min={0} step="any" value={value} onChange={event=>setValue(event.target.value)} aria-describedby="dos-report-target"/>
        <small id="dos-report-target">{d.kind==='STAT'?'Chỉ tiêu thống kê: nhập số liệu thực tế của kỳ.':`Chỉ tiêu giao: ${d.targetText||valueWithUnit(d.targetValue,d.unit)}`}</small>
      </label>
      <label className="full">Giá trị nguyên văn (không bắt buộc)
        <input type="text" value={valueText} maxLength={300} placeholder="Ví dụ: Đạt; 12/15 hồ sơ; ≥ 50%" onChange={event=>setValueText(event.target.value)}/>
      </label>
      <label className="full">Nguồn số liệu {!isLeader&&<span className="dos-req">(bắt buộc nếu không có ghi chú)</span>}
        <input type="text" value={dataSource} maxLength={500} placeholder={d.dataSourceSystem?`Ví dụ: ${d.dataSourceSystem}`:'Hệ thống, sổ sách hoặc cơ quan cung cấp số liệu'} onChange={event=>setDataSource(event.target.value)}/>
      </label>
      <label className="full">Giải trình {needsExplanation?<span className="dos-req">(bắt buộc)</span>:<span className="dos-muted">(khi chưa đạt hoặc nộp muộn)</span>}
        <textarea rows={3} value={explanation} maxLength={2000} onChange={event=>setExplanation(event.target.value)} aria-invalid={needsExplanation&&!explanation.trim()?true:undefined}/>
        {needsExplanation&&<small className="dos-warn-hint">{lateReport
          ?`${period?.label??'Kỳ này'} đã quá hạn báo cáo — nêu lý do nộp muộn.`
          :'Chỉ tiêu đang chậm tiến độ — nêu nguyên nhân và hướng khắc phục.'}</small>}
      </label>
      <label className="full">Ghi chú
        <textarea rows={2} value={note} maxLength={2000} onChange={event=>setNote(event.target.value)}/>
      </label>
      <div className="full">
        <EvidenceFileInput files={files} onChange={setFiles} disabled={saving}/>
        {d.evidenceRequirement&&<small className="field-hint">Yêu cầu minh chứng: {d.evidenceRequirement}</small>}
      </div>
    </div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <div className="row">
      <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>Huỷ</button>
      <button type="submit" className="btn primary" disabled={saving}><Send aria-hidden="true"/>{saving?'Đang gửi…':isLeader?'Ghi nhận số liệu':'Gửi báo cáo'}</button>
    </div>
  </form>;
}
