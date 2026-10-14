import { BellRing, CornerUpLeft, FileQuestion, History, Pencil, Repeat, UserPlus } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { api } from '../../api';
import { getInitials } from '../../authz';
import { fmtDateTime, relativeTime, untilText } from '../../ioc-format';
import { toast } from '../Toast';
import { Badge, Modal } from '../UI';
import { isHttpUrl, type PartProps } from './shared';

/** Cột phải của hồ sơ: người chịu trách nhiệm, phiếu nguồn số liệu, giải trình, căn cứ và dòng thời gian. */
export default function SidePanel(props:PartProps){
  return <aside className="dos-side" aria-label="Trách nhiệm và nguồn số liệu">
    <ResponsibilityCard {...props}/>
    <ExplanationCard {...props}/>
    <SourceCard {...props}/>
    <BasisCard {...props}/>
    <TimelineCard {...props}/>
  </aside>;
}

type Action='assign'|'transfer'|'return'|null;

function ResponsibilityCard({d,me,reload,fail}:PartProps){
  const [action,setAction]=useState<Action>(null);
  const [reminding,setReminding]=useState(false);
  const p=d.permissions;
  const transfersLeft=Math.max(0,d.maxTransfers-d.transferCount);
  const isAssignee=d.assignee?.id===me.id;

  async function remind(){
    setReminding(true);
    try{
      const result=await api<{sent:number;message:string}>(`/targets/${encodeURIComponent(d.id)}/remind`,{method:'POST'});
      if(result.sent)toast.ok('Đã gửi nhắc việc',d.assignee?`Gửi tới ${d.assignee.fullName}`:'Gửi tới trưởng phòng chủ trì');
      else toast.info('Không gửi thêm',result.message);
      await reload();
    }catch(error){fail(error,'Không gửi được nhắc việc')}
    finally{setReminding(false)}
  }

  return <section className="panel">
    <div className="panel-head"><div><h3>Người chịu trách nhiệm</h3></div></div>
    <div className="dos-person">
      {d.assignee
        ?<><span className="avatar small" aria-hidden="true">{getInitials(d.assignee.fullName)}</span>
          <div><strong>{d.assignee.fullName}{isAssignee?' (bạn)':''}</strong><small>{d.assignee.position||'Chuyên viên phụ trách'}</small></div></>
        :<div><strong className="ioc-warn">Chưa giao người phụ trách</strong><small>Trưởng phòng chủ trì cần giao một chuyên viên theo dõi chỉ tiêu này.</small></div>}
    </div>
    <dl className="dos-kv dos-gap">
      <div><dt>Phòng chủ trì</dt><dd><span className="dos-dept"><span className="ioc-dept-dot" style={{'--dept':d.department.color} as CSSProperties} aria-hidden="true"/>{d.department.name}</span></dd></div>
      {d.managers.length>0&&<div><dt>Trưởng phòng</dt><dd>{d.managers.map(item=>item.fullName).join(', ')}</dd></div>}
      {d.coordinators.length>0&&<div><dt>Phòng phối hợp</dt><dd>{d.coordinators.map(item=>item.department.name).join(', ')}</dd></div>}
      {(d.transferCount>0||d.bounceCount>0)&&<div><dt>Chuyển / trả việc</dt><dd>
        Đã chuyển {d.transferCount}/{d.maxTransfers} lần · bị đẩy qua lại {d.bounceCount} lần
        {d.bounceCount>=3&&<> <Badge tone="bad">Việc bị treo</Badge></>}
      </dd></div>}
    </dl>
    {(p.canAssign||p.canTransfer||p.canReturn)&&<div className="dos-actions">
      {p.canAssign&&<button type="button" className="btn primary sm" onClick={()=>setAction('assign')}><UserPlus aria-hidden="true"/>{d.assignee?'Giao lại':'Giao chuyên viên'}</button>}
      {p.canTransfer&&<button type="button" className="btn secondary sm" onClick={()=>setAction('transfer')}><Repeat aria-hidden="true"/>Chuyển đồng nghiệp</button>}
      {p.canReturn&&<button type="button" className="btn secondary sm" onClick={()=>setAction('return')}><CornerUpLeft aria-hidden="true"/>Trả về trưởng phòng</button>}
      {p.canAssign&&<button type="button" className="btn ghost sm" disabled={reminding} onClick={()=>void remind()}><BellRing aria-hidden="true"/>{reminding?'Đang gửi…':'Nhắc việc'}</button>}
    </div>}
    {isAssignee&&!p.canTransfer&&d.transferCount>=d.maxTransfers&&<p className="field-hint dos-gap">Đã hết lượt chuyển việc ({d.maxTransfers} lần). Nếu không đúng việc của bạn, hãy trả về trưởng phòng để phân công lại.</p>}
    {action&&<ResponsibilityModal d={d} me={me} reload={reload} fail={fail} action={action} transfersLeft={transfersLeft} onClose={()=>setAction(null)}/>}
  </section>;
}

function ResponsibilityModal({d,me,reload,fail,action,transfersLeft,onClose}:PartProps&{action:Exclude<Action,null>;transfersLeft:number;onClose:()=>void}){
  const candidates=d.staff.filter(person=>action==='transfer'?person.id!==me.id:true);
  const [userId,setUserId]=useState(action==='assign'?(d.assignee?.id??candidates[0]?.id??''):candidates[0]?.id??'');
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const titles={assign:'Giao chuyên viên phụ trách',transfer:'Chuyển cho đồng nghiệp',return:'Trả về trưởng phòng'};
  const descriptions={
    assign:'Người được giao nhận thông báo và chịu trách nhiệm báo cáo số liệu, minh chứng của chỉ tiêu.',
    transfer:`Chỉ chuyển khi đúng là việc của đồng nghiệp. Còn ${transfersLeft} lượt chuyển; hết lượt thì chỉ được trả về trưởng phòng.`,
    return:'Trưởng phòng sẽ nhận thông báo để phân công lại. Mỗi lần trả việc được ghi vào dòng thời gian trách nhiệm.',
  };

  async function submit(event:FormEvent){
    event.preventDefault();
    if(action!=='return'&&!userId){setError('Vui lòng chọn người nhận.');return}
    if(action!=='assign'&&text.trim().length<5){setError('Vui lòng nêu lý do (ít nhất 5 ký tự).');return}
    setBusy(true);setError('');
    const path=`/targets/${encodeURIComponent(d.id)}/${action}`;
    const body=action==='assign'?{assigneeId:userId,note:text.trim()||undefined}:action==='transfer'?{toUserId:userId,reason:text.trim()}:{reason:text.trim()};
    try{
      await api(path,{method:'POST',body:JSON.stringify(body)});
      const name=d.staff.find(person=>person.id===userId)?.fullName;
      toast.ok(action==='assign'?'Đã giao việc':action==='transfer'?'Đã chuyển việc':'Đã trả về trưởng phòng',action==='return'?d.title:`${name??''} — ${d.code}`);
      onClose();
      await reload();
    }catch(caught){setError(fail(caught,'Không thực hiện được thao tác'))}
    finally{setBusy(false)}
  }

  return <Modal title={titles[action]} description={descriptions[action]} onClose={()=>{if(!busy)onClose()}}>
    <form className="modal-body" onSubmit={submit} noValidate>
      {action!=='return'&&(candidates.length
        ?<label>{action==='assign'?'Người phụ trách':'Chuyển cho'}
          <select value={userId} onChange={event=>setUserId(event.target.value)}>
            {candidates.map(person=><option key={person.id} value={person.id}>{person.fullName}{person.position?` — ${person.position}`:''}</option>)}
          </select>
        </label>
        :<p className="notice warn">Phòng chủ trì chưa có cán bộ nào khác đang hoạt động trên hệ thống.</p>)}
      <label>{action==='assign'?'Lời nhắn (không bắt buộc)':'Lý do (bắt buộc)'}
        <textarea rows={3} value={text} maxLength={500} onChange={event=>setText(event.target.value)} placeholder={action==='assign'?'Ví dụ: Lấy số liệu từ phần mềm một cửa trước ngày 20 hằng tháng':'Ví dụ: Số liệu do bộ phận khác quản lý'}/>
      </label>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Huỷ</button>
        <button type="submit" className="btn primary" disabled={busy||(action!=='return'&&!candidates.length)}>{busy?'Đang xử lý…':titles[action]}</button>
      </div>
    </form>
  </Modal>;
}

function ExplanationCard({d,reload,fail}:PartProps){
  const [requesting,setRequesting]=useState(false);
  const [message,setMessage]=useState('');
  const [dueDays,setDueDays]=useState('');
  const [responding,setResponding]=useState<string|null>(null);
  const [response,setResponse]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const open=d.explanationRequests.find(item=>item.status==='OPEN');
  if(!d.explanationRequests.length&&!d.permissions.canRequestExplanation)return null;

  async function request(event:FormEvent){
    event.preventDefault();
    if(message.trim().length<5){setError('Nội dung yêu cầu phải có ít nhất 5 ký tự.');return}
    const days=dueDays.trim()?Number(dueDays):undefined;
    if(days!==undefined&&(!Number.isInteger(days)||days<1||days>30)){setError('Thời hạn từ 1 đến 30 ngày.');return}
    setBusy(true);setError('');
    try{
      await api(`/targets/${encodeURIComponent(d.id)}/explanations`,{method:'POST',body:JSON.stringify({message:message.trim(),dueDays:days})});
      toast.ok('Đã yêu cầu giải trình','Trưởng phòng và người phụ trách đã nhận thông báo.');
      setRequesting(false);setMessage('');setDueDays('');
      await reload();
    }catch(caught){setError(fail(caught,'Không gửi được yêu cầu giải trình'))}
    finally{setBusy(false)}
  }

  async function respond(event:FormEvent,id:string,version:number){
    event.preventDefault();
    if(response.trim().length<10){setError('Nội dung giải trình phải có ít nhất 10 ký tự.');return}
    setBusy(true);setError('');
    try{
      await api(`/targets/${encodeURIComponent(d.id)}/explanations/${encodeURIComponent(id)}/respond`,{method:'POST',body:JSON.stringify({response:response.trim(),expectedVersion:version})});
      toast.ok('Đã gửi giải trình','Lãnh đạo đã nhận thông báo.');
      setResponding(null);setResponse('');
      await reload();
    }catch(caught){setError(fail(caught,'Không gửi được giải trình'))}
    finally{setBusy(false)}
  }

  return <section className={`panel ${open?'dos-explain':''}`}>
    <div className="panel-head">
      <div><h3>Giải trình</h3>{open&&<p className="ioc-warn">Đang chờ trả lời · {untilText(open.dueAt)}</p>}</div>
      {d.permissions.canRequestExplanation&&!open&&!requesting&&<button type="button" onClick={()=>setRequesting(true)}><FileQuestion aria-hidden="true"/>Yêu cầu</button>}
    </div>
    {requesting&&<form className="dos-form" onSubmit={request} noValidate>
      <label>Nội dung yêu cầu
        <textarea rows={3} value={message} maxLength={1000} onChange={event=>setMessage(event.target.value)} placeholder="Ví dụ: Đề nghị giải trình nguyên nhân chậm tiến độ và lộ trình đạt chỉ tiêu"/>
      </label>
      <label>Thời hạn trả lời (ngày, để trống theo cấu hình)
        <input type="number" min={1} max={30} value={dueDays} onChange={event=>setDueDays(event.target.value)}/>
      </label>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="row">
        <button type="button" className="btn secondary sm" disabled={busy} onClick={()=>{setRequesting(false);setError('')}}>Huỷ</button>
        <button type="submit" className="btn primary sm" disabled={busy}>{busy?'Đang gửi…':'Gửi yêu cầu'}</button>
      </div>
    </form>}
    {d.explanationRequests.map(item=><article key={item.id} className={`dos-entry ${item.status==='ANSWERED'?'dos-explain answered':item.status==='OPEN'?'dos-explain':''}`}>
      <header>
        <Badge tone={item.status==='OPEN'?(new Date(item.dueAt).getTime()<Date.now()?'bad':'warn'):item.status==='ANSWERED'?'ok':'neutral'}>
          {item.status==='OPEN'?(new Date(item.dueAt).getTime()<Date.now()?'Quá hạn trả lời':'Chờ trả lời'):item.status==='ANSWERED'?'Đã giải trình':'Đã huỷ'}
        </Badge>
        <span className="right dos-muted">Hạn {fmtDateTime(item.dueAt)}</span>
      </header>
      <p>{item.message}</p>
      <div className="meta">{item.requestedBy.fullName}{item.requestedBy.position?` (${item.requestedBy.position})`:''} · {fmtDateTime(item.createdAt)}</div>
      {item.response&&<p className="dos-note"><b>Giải trình của {item.responderName??'phòng chủ trì'}:</b> {item.response}{item.respondedAt?` (${fmtDateTime(item.respondedAt)})`:''}</p>}
      {item.status==='OPEN'&&d.permissions.canRespondExplanation&&(responding===item.id
        ?<form className="dos-form dos-gap" onSubmit={event=>void respond(event,item.id,item.version)} noValidate>
          <label>Nội dung giải trình
            <textarea rows={4} value={response} maxLength={4000} onChange={event=>setResponse(event.target.value)} placeholder="Nguyên nhân, việc đã làm, lộ trình đạt chỉ tiêu"/>
          </label>
          {error&&<div className="form-error" role="alert">{error}</div>}
          <div className="row">
            <button type="button" className="btn secondary sm" disabled={busy} onClick={()=>{setResponding(null);setError('')}}>Huỷ</button>
            <button type="submit" className="btn primary sm" disabled={busy}>{busy?'Đang gửi…':'Gửi giải trình'}</button>
          </div>
        </form>
        :<div className="dos-actions"><button type="button" className="btn primary sm" onClick={()=>{setResponding(item.id);setResponse('');setError('')}}>Trả lời giải trình</button></div>)}
    </article>)}
  </section>;
}

function SourceCard({d,reload,fail}:PartProps){
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({dataSourceSystem:'',dataSourceAgency:'',collectionGuide:'',dataSourceUrl:'',evidenceRequirement:'',reportDueDay:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const empty=!d.dataSourceSystem&&!d.dataSourceAgency&&!d.collectionGuide&&!d.dataSourceUrl&&!d.evidenceRequirement;

  function start(){
    setForm({
      dataSourceSystem:d.dataSourceSystem??'',dataSourceAgency:d.dataSourceAgency??'',collectionGuide:d.collectionGuide??'',
      dataSourceUrl:d.dataSourceUrl??'',evidenceRequirement:d.evidenceRequirement??'',reportDueDay:d.reportDueDay?String(d.reportDueDay):'',
    });
    setError('');setEditing(true);
  }

  async function save(event:FormEvent){
    event.preventDefault();
    const day=form.reportDueDay.trim()?Number(form.reportDueDay):undefined;
    if(day!==undefined&&(!Number.isInteger(day)||day<1||day>31)){setError('Ngày hạn báo cáo từ 1 đến 31.');return}
    setBusy(true);setError('');
    try{
      await api(`/targets/${encodeURIComponent(d.id)}/source-card`,{method:'PATCH',body:JSON.stringify({
        expectedVersion:d.version,dataSourceSystem:form.dataSourceSystem,dataSourceAgency:form.dataSourceAgency,
        collectionGuide:form.collectionGuide,dataSourceUrl:form.dataSourceUrl,evidenceRequirement:form.evidenceRequirement,reportDueDay:day,
      })});
      toast.ok('Đã lưu phiếu nguồn số liệu');
      setEditing(false);
      await reload();
    }catch(caught){setError(fail(caught,'Không lưu được phiếu nguồn số liệu'))}
    finally{setBusy(false)}
  }

  const field=(key:keyof typeof form,label:string,multiline=false)=><label>{label}
    {multiline
      ?<textarea rows={3} value={form[key]} maxLength={4000} onChange={event=>setForm({...form,[key]:event.target.value})}/>
      :<input type="text" value={form[key]} maxLength={key==='dataSourceUrl'?1000:500} onChange={event=>setForm({...form,[key]:event.target.value})}/>}
  </label>;

  return <section className="panel">
    <div className="panel-head">
      <div><h3>Phiếu nguồn số liệu</h3><p>Số này lấy ở đâu, ai cung cấp, lấy thế nào.</p></div>
      {d.permissions.canEditSourceCard&&!editing&&<button type="button" onClick={start}><Pencil aria-hidden="true"/>Sửa</button>}
    </div>
    {editing
      ?<form className="dos-form" onSubmit={save} noValidate>
        {field('dataSourceSystem','Hệ thống / nguồn số liệu')}
        {field('dataSourceAgency','Cơ quan, bộ phận cung cấp')}
        {field('collectionGuide','Hướng dẫn lấy số liệu',true)}
        {field('dataSourceUrl','Đường dẫn tra cứu')}
        {field('evidenceRequirement','Yêu cầu minh chứng',true)}
        <label>Hạn báo cáo (ngày trong tháng cuối kỳ)
          <input type="number" min={1} max={31} value={form.reportDueDay} onChange={event=>setForm({...form,reportDueDay:event.target.value})}/>
        </label>
        {error&&<div className="form-error" role="alert">{error}</div>}
        <div className="row">
          <button type="button" className="btn secondary sm" disabled={busy} onClick={()=>setEditing(false)}>Huỷ</button>
          <button type="submit" className="btn primary sm" disabled={busy}>{busy?'Đang lưu…':'Lưu phiếu'}</button>
        </div>
      </form>
      :empty
        ?<p className="dos-muted">Chưa ghi nguồn số liệu.{d.permissions.canEditSourceCard?' Bổ sung để người sau biết lấy số ở đâu.':''}</p>
        :<dl className="dos-kv">
          {d.dataSourceSystem&&<Row label="Hệ thống / nguồn">{d.dataSourceSystem}</Row>}
          {d.dataSourceAgency&&<Row label="Cơ quan cung cấp">{d.dataSourceAgency}</Row>}
          {d.collectionGuide&&<Row label="Cách lấy số liệu">{d.collectionGuide}</Row>}
          {d.dataSourceUrl&&<Row label="Tra cứu">{isHttpUrl(d.dataSourceUrl)?<a href={d.dataSourceUrl} target="_blank" rel="noopener noreferrer">{d.dataSourceUrl}</a>:d.dataSourceUrl}</Row>}
          {d.evidenceRequirement&&<Row label="Yêu cầu minh chứng">{d.evidenceRequirement}</Row>}
          <Row label="Hạn báo cáo">Ngày {d.reportDueDay??20} tháng cuối kỳ</Row>
        </dl>}
  </section>;
}

function BasisCard({d}:PartProps){
  const legal=d.legalBasis||d.framework?.legalBasis;
  if(!legal&&!d.description&&!d.scoringRule)return null;
  return <section className="panel">
    <div className="panel-head"><div><h3>Căn cứ và cách đánh giá</h3></div></div>
    <dl className="dos-kv">
      {legal&&<Row label="Căn cứ pháp lý">{legal}</Row>}
      {d.scoringRule&&<Row label="Thang chấm">{d.scoringRule}</Row>}
      {d.description&&<Row label="Mô tả">{d.description}</Row>}
    </dl>
  </section>;
}

function TimelineCard({d}:PartProps){
  const [all,setAll]=useState(false);
  const events=all?d.workEvents:d.workEvents.slice(0,8);
  return <section className="panel">
    <div className="panel-head"><div><h3><History aria-hidden="true"/> Dòng thời gian trách nhiệm</h3><p>Ai giao, ai báo cáo, ai duyệt, ai chậm.</p></div></div>
    {events.length
      ?<ol className="ops-timeline">
        {events.map(event=><li key={event.id}>
          <span className="what"><b>{event.actorName}</b> {event.label.toLowerCase()}</span>
          {event.note&&<span className="note">{event.note}</span>}
          <time className="when" dateTime={event.createdAt} title={fmtDateTime(event.createdAt)}>{relativeTime(event.createdAt)}</time>
        </li>)}
      </ol>
      :<p className="dos-muted">Chưa có hoạt động nào.</p>}
    {d.workEvents.length>8&&<button type="button" className="btn ghost sm" onClick={()=>setAll(value=>!value)}>{all?'Thu gọn':`Xem tất cả ${d.workEvents.length} hoạt động`}</button>}
  </section>;
}

function Row({label,children}:{label:string;children:ReactNode}){
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}
