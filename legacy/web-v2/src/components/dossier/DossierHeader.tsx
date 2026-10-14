import { Archive, Calculator, ChevronRight, ListTree, RefreshCw } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, fmtDateTime, fmtNumber, untilText, valueWithUnit } from '../../ioc-format';
import { frameworkKindLabels, frequencyLabels, issuingLevelLabels } from '../../ioc-types';
import { statusMeta } from '../../types';
import { Badge, CopyCode } from '../UI';
import { periodLabel, type DossierData } from './shared';

const barTone:Record<string,string>={COMPLETED:'ok',ON_TRACK:'ok',AT_RISK:'warn',OVERDUE:'bad'};

/** Đầu hồ sơ: đường dẫn, mã, tiêu đề, nhãn phân loại và các con số chính. */
export default function DossierHeader({d,refreshing,onRefresh}:{d:DossierData;refreshing:boolean;onRefresh:()=>void}){
  const status=statusMeta[d.status]??statusMeta.NOT_STARTED;
  const isStat=d.kind==='STAT';
  const reported=Boolean(d.lastReportedAt);
  const manual=d.valueSource==='MANUAL';
  const direction=d.direction==='LOWER_IS_BETTER'?'Càng thấp càng tốt':'Càng cao càng tốt';

  return <header className="dos-head">
    <nav className="dos-crumbs" aria-label="Vị trí chỉ tiêu">
      <Link to="/admin/bo-chi-tieu">Bộ chỉ tiêu</Link>
      <ChevronRight aria-hidden="true"/>
      {d.framework
        ?<Link to={`/admin/targets?frameworkId=${encodeURIComponent(d.framework.id)}`}>{d.framework.name}</Link>
        :<Link to="/admin/targets">Danh mục chỉ tiêu</Link>}
      {d.groupName&&<><ChevronRight aria-hidden="true"/><span>{d.groupName}</span></>}
      {d.parent&&<><ChevronRight aria-hidden="true"/><Link to={`/admin/targets/${d.parent.id}`} title={d.parent.title}>{d.parent.code}</Link></>}
    </nav>

    <div className="dos-title">
      <div className="dos-title-main">
        <div className="dos-ids">
          <CopyCode value={d.code} label="mã chỉ tiêu"/>
          {d.standardCode&&<span className="dos-std" title="Mã chuẩn trong bộ chỉ tiêu">Mã chuẩn <b>{d.standardCode}</b></span>}
          {d.ordinal&&<span className="dos-std" title="Số thứ tự trong văn bản giao">STT <b>{d.ordinal}</b></span>}
        </div>
        <h2>{d.title}</h2>
      </div>
      <button type="button" className="btn secondary sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={refreshing?'spin':undefined} aria-hidden="true"/>{refreshing?'Đang tải…':'Làm mới'}
      </button>
    </div>

    <div className="dos-tags">
      <Badge tone="accent">{frameworkKindLabels[d.kind]??d.kind}</Badge>
      <Badge tone="neutral">{issuingLevelLabels[d.issuingLevel]??d.issuingLevel}</Badge>
      <span className={`status ${status.color}`}>{status.label}</span>
      {d.valueSource==='COMPUTED'&&<Badge tone="ai"><Calculator aria-hidden="true"/>Tự tính từ dữ liệu</Badge>}
      {d.valueSource==='CHILDREN'&&<Badge tone="info"><ListTree aria-hidden="true"/>Tổng hợp từ chỉ tiêu con</Badge>}
      {d.isArchived&&<Badge tone="warn"><Archive aria-hidden="true"/>Đã lưu trữ</Badge>}
      <span className="dos-dept"><span className="ioc-dept-dot" style={{'--dept':d.department.color} as CSSProperties} aria-hidden="true"/>{d.department.name}</span>
    </div>

    {d.isArchived&&<div className="notice warn" role="note">
      <Archive aria-hidden="true"/>
      <p>Chỉ tiêu đã được lưu trữ{d.archivedAt?` ngày ${fmtDate(d.archivedAt)}`:''}{d.archiveReason?`: ${d.archiveReason}`:''}. Hồ sơ chỉ để tra cứu, không nhận báo cáo hay giao việc mới.</p>
    </div>}

    <div className="dos-figures">
      <div className="dos-figure">
        <span>Chỉ tiêu giao</span>
        <strong>{d.targetText||(isStat?'Không đặt mục tiêu':valueWithUnit(d.targetValue,d.unit))}</strong>
        <small>{d.targetText&&!isStat?`Quy đổi ${valueWithUnit(d.targetValue,d.unit)} · `:''}{isStat?'Chỉ tiêu thống kê, theo dõi số liệu':direction}</small>
      </div>
      <div className="dos-figure">
        <span>Thực hiện hiện tại</span>
        <strong>{reported?valueWithUnit(d.currentValue,d.unit):'Chưa có số liệu'}</strong>
        <small>{reported
          ?`${d.valueSource==='MANUAL'?'Cập nhật':'Tự cập nhật'} ${fmtDateTime(d.computedAt&&!manual?d.computedAt:d.lastReportedAt)}`
          :manual?'Chưa có báo cáo được ghi nhận':'Chưa tính được từ dữ liệu'}</small>
      </div>
      {!isStat&&<div className="dos-figure">
        <span>Tiến độ</span>
        <strong>{reported?`${fmtNumber(d.progress)}%`:'—'}</strong>
        <div className="progress" role="img" aria-label={`Tiến độ ${fmtNumber(d.progress)}%`}><i className={barTone[d.status]} style={{width:`${Math.max(0,Math.min(100,d.progress))}%`}}/></div>
        <small>{status.label}</small>
      </div>}
      {d.kind==='SCORE'&&<div className="dos-figure">
        <span>Điểm đạt</span>
        <strong>{reported?fmtNumber(d.currentValue):'—'} / {fmtNumber(d.maxScore??d.targetValue)}</strong>
        <small>{d.framework?.maxScore?`Bộ chỉ tiêu tối đa ${fmtNumber(d.framework.maxScore)} điểm`:'điểm'}</small>
      </div>}
      <div className="dos-figure">
        <span>Hạn hoàn thành</span>
        <strong>{fmtDate(d.dueDate)}</strong>
        <small>{d.status==='COMPLETED'?'Đã hoàn thành':untilText(d.dueDate)}</small>
      </div>
      <div className="dos-figure">
        <span>Kỳ báo cáo</span>
        <strong>{frequencyLabels[d.frequency]??d.frequency}</strong>
        <small>{manual
          ?`Kỳ hiện tại: ${periodLabel(d.currentPeriodKey)} · hạn ngày ${d.reportDueDay??20} tháng cuối kỳ`
          :'Hệ thống tự cập nhật, không nhập tay'}</small>
      </div>
    </div>
  </header>;
}
