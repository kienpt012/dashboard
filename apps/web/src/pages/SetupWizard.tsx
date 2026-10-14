import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Layers, MapPin, Save, Timer, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { toast } from '../components/Toast';
import { PageHead, SkeletonCards } from '../components/UI';
import { fmtDateTime } from '../ioc-format';
import type { FrameworkTemplate } from '../ioc-types';
import { refreshLocality } from '../locality';
import '../styles/ioc-setup.css';

type OrgDepartment={code:string;name:string;shortName?:string;kind:string;role:string;color?:string;responsibilities?:string;optional?:boolean};
type OrgTemplate={kind:string;key:string;label:string;note?:string;departments:OrgDepartment[]};
type Settings={reportAutoApproveDays:number;proposalAutoApproveDays:number;explanationDueDays:number;assignmentStallDays:number;maxTransfers:number;wallboardRotateSeconds:number};
type Templates={
  year:number;localityKinds:{value:string;label:string}[];orgTemplates:OrgTemplate[];frameworkTemplates:FrameworkTemplate[];
  existingDepartments:{id:string;code:string;name:string;shortName?:string|null;kind:string;color:string;responsibilities?:string|null;isActive:boolean}[];
  settings:Settings;
};
type Locality={
  kind:string;name:string;agencyName:string;shortName:string;provinceName?:string|null;adminUnitCode?:string|null;agencyCode?:string|null;
  address?:string|null;phone?:string|null;email?:string|null;website?:string|null;emailDomain?:string|null;primaryColor:string;
  configured?:boolean;setupCompletedAt?:string|null;appliedTemplates?:string[];
};
type LocalityForm={[K in keyof Omit<Locality,'configured'|'setupCompletedAt'|'appliedTemplates'>]-?:string};
type ApplyResult={departments:{created:number;updated:number};frameworks:({key:string;error:string}|{key:string;frameworkId?:string;created?:number;skipped?:boolean;[key:string]:unknown})[]};

const STEPS=[
  {label:'Thông tin địa phương',icon:MapPin},
  {label:'Cơ cấu tổ chức',icon:Building2},
  {label:'Bộ chỉ tiêu',icon:Layers},
  {label:'Thời hạn trách nhiệm',icon:Timer},
  {label:'Xem lại và áp dụng',icon:Wand2},
];

const SETTING_FIELDS:{key:keyof Settings;label:string;min:number;max:number;unit:string;hint:string}[]=[
  {key:'reportAutoApproveDays',label:'Tự thông qua báo cáo số liệu sau',min:0,max:60,unit:'ngày',hint:'Cán bộ gửi số liệu mà trưởng phòng không duyệt trong số ngày này thì hệ thống tự thông qua và ghi trách nhiệm người duyệt. Đặt 0 để tắt.'},
  {key:'proposalAutoApproveDays',label:'Tự thông qua đề xuất chỉ tiêu sau',min:0,max:30,unit:'ngày',hint:'Đề xuất đã trình không ai quyết định trong số ngày này thì tự thành chỉ tiêu. Đề xuất do AI trích xuất không bao giờ tự thông qua khi chưa có người trình. Đặt 0 để tắt.'},
  {key:'explanationDueDays',label:'Thời hạn trả lời giải trình',min:1,max:30,unit:'ngày',hint:'Khi lãnh đạo yêu cầu giải trình, phòng chủ trì phải trả lời trong số ngày này; quá hạn thì báo lãnh đạo.'},
  {key:'assignmentStallDays',label:'Nhắc giao người sau',min:0,max:30,unit:'ngày',hint:'Chỉ tiêu chưa giao chuyên viên quá số ngày này thì nhắc trưởng phòng; quá gấp đôi thì báo lãnh đạo.'},
  {key:'maxTransfers',label:'Số lần chuyển việc tối đa',min:0,max:5,unit:'lần',hint:'Chuyên viên được chuyển chỉ tiêu cho đồng nghiệp bấy nhiêu lần; hết lượt thì chỉ được trả về trưởng phòng — chống "đá việc".'},
  {key:'wallboardRotateSeconds',label:'Chuyển trang trình chiếu sau',min:5,max:300,unit:'giây',hint:'Màn hình phòng họp tự chuyển sang bộ chỉ tiêu hoặc phòng tiếp theo sau số giây này.'},
];

const EMPTY_LOCALITY:LocalityForm={kind:'PHUONG',name:'',agencyName:'',shortName:'',provinceName:'',adminUnitCode:'',agencyCode:'',address:'',phone:'',email:'',website:'',emailDomain:'',primaryColor:'#1d4ed8'};

function initials(text:string){
  const words=text.trim().split(/\s+/).filter(Boolean);
  return (words.length>=2?words[0][0]+words[words.length-1][0]:(words[0]??'IO').slice(0,2)).toUpperCase();
}

/** Thiết lập địa phương (HT-01): năm bước để mang hệ thống sang bất kỳ xã, phường, đặc khu nào. */
export default function SetupWizard(){
  const [templates,setTemplates]=useState<Templates|null>(null);
  const [current,setCurrent]=useState<Locality|null>(null);
  const [error,setError]=useState('');
  const [step,setStep]=useState(0);
  const [locality,setLocality]=useState<LocalityForm>(EMPTY_LOCALITY);
  const [orgKey,setOrgKey]=useState('');
  const [departments,setDepartments]=useState<(OrgDepartment&{selected:boolean})[]>([]);
  const [frameworkKeys,setFrameworkKeys]=useState<string[]>([]);
  const [year,setYear]=useState(new Date().getFullYear());
  const [settings,setSettings]=useState<Settings|null>(null);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<ApplyResult|null>(null);
  const [stepError,setStepError]=useState('');

  useEffect(()=>{
    Promise.all([api<Templates>('/setup/templates'),api<Locality>('/locality')]).then(([loadedTemplates,loadedLocality])=>{
      setTemplates(loadedTemplates);setCurrent(loadedLocality);setYear(loadedTemplates.year);setSettings(loadedTemplates.settings);
      setLocality(Object.fromEntries(Object.keys(EMPTY_LOCALITY).map(key=>[key,String((loadedLocality as Record<string,unknown>)[key]??EMPTY_LOCALITY[key as keyof LocalityForm])])) as LocalityForm);
      const org=loadedTemplates.orgTemplates.find(item=>item.kind===loadedLocality.kind)??loadedTemplates.orgTemplates[0];
      if(org)chooseOrg(org,loadedTemplates);
    }).catch(caught=>setError(caught instanceof Error?caught.message:'Không tải được dữ liệu thiết lập'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function chooseOrg(org:OrgTemplate,source=templates){
    setOrgKey(org.key);
    const existing=new Set(source?.existingDepartments.map(item=>item.code.toUpperCase())??[]);
    setDepartments(org.departments.map(item=>({...item,selected:!item.optional||existing.has(item.code.toUpperCase())})));
  }

  const kindLabel=templates?.localityKinds.find(item=>item.value===locality.kind)?.label??'';
  const suitable=(template:FrameworkTemplate)=>!template.scope.localityKinds.length||template.scope.localityKinds.includes(locality.kind);
  const brand=locality.shortName.trim()?`IOC ${locality.shortName.trim()}`:'IOC';
  const existingCodes=useMemo(()=>new Set(templates?.existingDepartments.map(item=>item.code.toUpperCase())??[]),[templates]);

  function validateStep(index:number){
    if(index===0){
      if(locality.name.trim().length<3)return 'Vui lòng nhập tên đơn vị (ít nhất 3 ký tự).';
      if(locality.agencyName.trim().length<3)return 'Vui lòng nhập tên cơ quan (ít nhất 3 ký tự).';
      if(!locality.shortName.trim())return 'Vui lòng nhập tên ngắn để làm tên ứng dụng.';
      if(locality.adminUnitCode.trim()&&!/^\d{5}$/.test(locality.adminUnitCode.trim()))return 'Mã đơn vị hành chính cấp xã gồm 5 chữ số.';
      if(locality.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(locality.email.trim()))return 'Email liên hệ không hợp lệ.';
      if(locality.website.trim()&&!/^https?:\/\/\S+$/.test(locality.website.trim()))return 'Trang thông tin phải bắt đầu bằng http:// hoặc https://';
      if(!/^#[0-9a-f]{6}$/i.test(locality.primaryColor))return 'Màu chủ đạo phải là mã màu dạng #RRGGBB.';
    }
    if(index===1&&!departments.some(item=>item.selected))return 'Chọn ít nhất một phòng ban.';
    if(index===1&&departments.some(item=>item.selected&&item.name.trim().length<2))return 'Tên phòng ban không được để trống.';
    if(index===3&&settings&&SETTING_FIELDS.some(field=>!Number.isInteger(settings[field.key])||settings[field.key]<field.min||settings[field.key]>field.max))return 'Có thời hạn nằm ngoài giới hạn cho phép.';
    return '';
  }

  function go(next:number){
    if(next>step){
      for(let index=step;index<next;index+=1){
        const problem=validateStep(index);
        if(problem){setStep(index);setStepError(problem);return}
      }
    }
    setStepError('');setStep(next);
  }

  function localityPayload(){
    const text=(value:string)=>value.trim()||null;
    return {
      kind:locality.kind,name:locality.name.trim(),agencyName:locality.agencyName.trim(),shortName:locality.shortName.trim(),
      provinceName:text(locality.provinceName),adminUnitCode:text(locality.adminUnitCode),agencyCode:text(locality.agencyCode),
      address:text(locality.address),phone:text(locality.phone),email:text(locality.email),website:text(locality.website),
      emailDomain:text(locality.emailDomain),primaryColor:locality.primaryColor,
    };
  }

  async function saveLocalityOnly(){
    const problem=validateStep(0);
    if(problem){setStepError(problem);return}
    setBusy(true);
    try{
      await api('/locality',{method:'PUT',body:JSON.stringify(localityPayload())});
      await refreshLocality();
      toast.ok('Đã lưu thông tin địa phương',`Tên ứng dụng: ${brand}`);
    }catch(caught){toast.error('Không lưu được thông tin địa phương',caught instanceof Error?caught.message:undefined)}
    finally{setBusy(false)}
  }

  async function apply(){
    for(let index=0;index<4;index+=1){const problem=validateStep(index);if(problem){setStep(index);setStepError(problem);return}}
    setBusy(true);setStepError('');
    try{
      const payload={
        locality:localityPayload(),
        departments:departments.filter(item=>item.selected).map(item=>({
          code:item.code,name:item.name.trim(),shortName:item.shortName?.trim()||undefined,kind:item.kind,color:item.color,responsibilities:item.responsibilities?.trim()||undefined,
        })),
        frameworkTemplates:frameworkKeys,year,settings:settings??undefined,
      };
      const response=await api<ApplyResult>('/setup/apply',{method:'POST',body:JSON.stringify(payload)});
      setResult(response);
      await refreshLocality();
      const failed=response.frameworks.filter(item=>'error' in item);
      if(failed.length)toast.warn('Áp dụng xong, một số bộ chỉ tiêu chưa nạp được',failed.map(item=>`${item.key}: ${(item as {error:string}).error}`).join(' · '));
      else toast.ok('Đã thiết lập địa phương',`${brand} sẵn sàng sử dụng`);
    }catch(caught){setStepError(caught instanceof Error?caught.message:'Không áp dụng được thiết lập')}
    finally{setBusy(false)}
  }

  if(error)return <div className="form-error" role="alert">{error}</div>;
  if(!templates||!settings||!current)return <SkeletonCards count={3}/>;

  if(result)return <div className="setup">
    <PageHead eyebrow="Hệ thống" title="Đã thiết lập địa phương" description={`${locality.name} đã sẵn sàng. Tên ứng dụng hiển thị: ${brand}.`}/>
    <section className="panel su-done">
      <CheckCircle2 aria-hidden="true"/>
      <ul>
        <li>Phòng ban: tạo mới {result.departments.created}, cập nhật {result.departments.updated}.</li>
        {result.frameworks.map(item=><li key={item.key}>{'error' in item
          ?<span className="ioc-bad">Bộ {templates.frameworkTemplates.find(template=>template.key===item.key)?.sampleName??item.key}: {String((item as {error:string}).error)}</span>
          :<>Bộ chỉ tiêu {templates.frameworkTemplates.find(template=>template.key===item.key)?.sampleName??item.key}: đã nạp cho năm {year}.</>}</li>)}
        {!result.frameworks.length&&<li>Chưa nạp bộ chỉ tiêu nào — có thể nạp sau ở trang Bộ chỉ tiêu.</li>}
      </ul>
      <p>Bước tiếp theo:</p>
      <div className="su-nav">
        <Link className="btn secondary" to="/admin/users">Tạo tài khoản lãnh đạo, văn thư, trưởng phòng</Link>
        <Link className="btn secondary" to="/admin/bo-chi-tieu">Xem bộ chỉ tiêu</Link>
        <Link className="btn primary" to="/admin">Mở Trung tâm điều hành</Link>
      </div>
    </section>
  </div>;

  const field=(key:keyof LocalityForm,label:string,props:{placeholder?:string;type?:string;hint?:string;required?:boolean}={})=><label key={key}>
    {label}{props.required&&<span className="dos-req"> *</span>}
    <input type={props.type??'text'} value={locality[key]} placeholder={props.placeholder} onChange={event=>setLocality({...locality,[key]:event.target.value})}/>
    {props.hint&&<small className="field-hint">{props.hint}</small>}
  </label>;

  return <div className="setup">
    <PageHead eyebrow="Hệ thống" title="Thiết lập địa phương"
      description="Năm bước để hệ thống dùng được cho bất kỳ xã, phường, đặc khu nào: tên đơn vị, cơ cấu tổ chức, bộ chỉ tiêu và thời hạn trách nhiệm. Chạy lại được nhiều lần, không mất dữ liệu đang có."/>
    {current.setupCompletedAt&&<div className="info-box su-gap"><CheckCircle2 aria-hidden="true"/><p>Địa phương đã thiết lập lúc {fmtDateTime(current.setupCompletedAt)}. Chạy lại để bổ sung phòng ban hoặc bộ chỉ tiêu: phòng đã có chỉ được cập nhật thông tin, bộ chỉ tiêu đã nạp cho năm đó được bỏ qua.</p></div>}

    <ol className="su-steps" aria-label="Các bước thiết lập">
      {STEPS.map((item,index)=><li key={item.label}>
        <button type="button" className={`su-step ${index===step?'active':''} ${index<step?'done':''}`} aria-current={index===step?'step':undefined} onClick={()=>go(index)}>
          <b>{index<step?<Check aria-hidden="true"/>:index+1}</b>{item.label}
        </button>
      </li>)}
    </ol>

    <section className="panel">
      {step===0&&<>
        <div className="panel-head"><div><h3>Thông tin địa phương</h3><p>Tên đơn vị xuất hiện trên tiêu đề, chân trang, email, tệp Excel và trang công khai.</p></div></div>
        <div className="su-brand-preview" style={{'--su-brand':locality.primaryColor} as CSSProperties}>
          <span className="mark" aria-hidden="true">{initials(locality.shortName||locality.name)}</span>
          <span><strong>{brand.toUpperCase()}</strong><small>{locality.agencyName||'Tên cơ quan'}</small></span>
        </div>
        <div className="form-grid two">
          <label>Loại đơn vị<select value={locality.kind} onChange={event=>{setLocality({...locality,kind:event.target.value});const org=templates.orgTemplates.find(item=>item.kind===event.target.value);if(org)chooseOrg(org)}}>
            {templates.localityKinds.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select></label>
          {field('provinceName','Tỉnh, thành phố',{placeholder:'Ví dụ: Thành phố Hồ Chí Minh'})}
          {field('name','Tên đơn vị',{placeholder:`${kindLabel} …`,required:true})}
          {field('agencyName','Tên cơ quan',{placeholder:'UBND …',required:true})}
          {field('shortName','Tên ngắn (tên ứng dụng)',{required:true,hint:`Hiển thị là "${brand}".`})}
          {field('adminUnitCode','Mã đơn vị hành chính',{placeholder:'5 chữ số',hint:'Theo Quyết định 19/2025/QĐ-TTg.'})}
          {field('agencyCode','Mã định danh cơ quan')}
          {field('address','Địa chỉ')}
          {field('phone','Điện thoại',{type:'tel'})}
          {field('email','Email liên hệ',{type:'email'})}
          {field('website','Trang thông tin điện tử',{type:'url',placeholder:'https://'})}
          {field('emailDomain','Tên miền email công vụ',{placeholder:'vd: ten-xa.gov.vn',hint:'Dùng gợi ý khi tạo tài khoản.'})}
          <label>Màu chủ đạo
            <span className="su-color"><input type="color" value={locality.primaryColor} onChange={event=>setLocality({...locality,primaryColor:event.target.value})} aria-label="Chọn màu"/><input type="text" value={locality.primaryColor} maxLength={7} onChange={event=>setLocality({...locality,primaryColor:event.target.value})}/></span>
          </label>
        </div>
        <div className="su-inline"><button type="button" className="btn ghost sm" disabled={busy} onClick={()=>void saveLocalityOnly()}><Save aria-hidden="true"/>Chỉ lưu thông tin địa phương</button></div>
      </>}

      {step===1&&<>
        <div className="panel-head"><div><h3>Cơ cấu tổ chức</h3><p>Chọn mẫu theo loại đơn vị rồi sửa tự do — tỉnh được quyết định cơ cấu phòng cấp xã (Nghị định 150/2025, sửa bởi 370/2025). Phòng cùng mã đã có chỉ được cập nhật tên và lĩnh vực, không mất dữ liệu.</p></div></div>
        <div className="su-options">
          {templates.orgTemplates.map(org=><button key={org.key} type="button" className={`su-option ${orgKey===org.key?'active':''}`} onClick={()=>chooseOrg(org)}>
            <strong>{org.label}</strong>{org.note&&<small>{org.note}</small>}<small>{org.departments.length} đơn vị ({org.departments.filter(item=>item.optional).length} tuỳ chọn)</small>
          </button>)}
        </div>
        <div className="su-depts">
          {departments.map((item,index)=><div key={item.code} className={`su-dept ${item.selected?'':'off'}`}>
            <label className="su-check"><input type="checkbox" checked={item.selected} onChange={event=>setDepartments(list=>list.map((entry,position)=>position===index?{...entry,selected:event.target.checked}:entry))}/>
              <span className="ioc-code">{item.code}</span>{item.optional&&<small>tuỳ chọn</small>}{existingCodes.has(item.code.toUpperCase())&&<small className="ioc-ok">đã có</small>}
            </label>
            <input type="text" aria-label={`Tên đơn vị ${item.code}`} value={item.name} disabled={!item.selected} onChange={event=>setDepartments(list=>list.map((entry,position)=>position===index?{...entry,name:event.target.value}:entry))}/>
            <input type="text" aria-label={`Lĩnh vực phụ trách của ${item.code}`} value={item.responsibilities??''} disabled={!item.selected} placeholder="Lĩnh vực phụ trách" onChange={event=>setDepartments(list=>list.map((entry,position)=>position===index?{...entry,responsibilities:event.target.value}:entry))}/>
          </div>)}
        </div>
        {templates.existingDepartments.some(item=>!departments.some(entry=>entry.code.toUpperCase()===item.code.toUpperCase()))&&<p className="field-hint">
          Phòng ban đang có nhưng không nằm trong mẫu (giữ nguyên, không bị xoá): {templates.existingDepartments.filter(item=>!departments.some(entry=>entry.code.toUpperCase()===item.code.toUpperCase())).map(item=>item.name).join(', ')}.
        </p>}
      </>}

      {step===2&&<>
        <div className="panel-head"><div><h3>Bộ chỉ tiêu</h3><p>Chọn các bộ từ thư viện mẫu. Mẫu chỉ chứa định nghĩa từ văn bản công khai; khi nạp, phòng chủ trì được gán theo chức năng phòng ban.</p></div>
          <label className="su-year">Năm áp dụng<input type="number" min={2000} max={2100} value={year} onChange={event=>setYear(Number(event.target.value))}/></label>
        </div>
        <div className="su-options">
          {templates.frameworkTemplates.map(template=>{
            const ok=suitable(template);
            const applied=(template.appliedYears??[]).includes(year);
            const checked=frameworkKeys.includes(template.key);
            return <label key={template.key} className={`su-option ${checked?'active':''} ${ok?'':'muted'}`}>
              <span className="su-check"><input type="checkbox" checked={checked} disabled={applied} onChange={event=>setFrameworkKeys(list=>event.target.checked?[...list,template.key]:list.filter(key=>key!==template.key))}/><strong>{template.sampleName}</strong></span>
              <small>{template.legalBasis}</small>
              <small>{template.targetCount} chỉ tiêu · {template.computedCount} tự tính · {template.datasetCount} bảng dữ liệu</small>
              {applied&&<small className="ioc-ok">Đã nạp cho năm {year}</small>}
              {!ok&&<small className="ioc-warn">Mẫu dành cho {template.scope.localityKinds.map(kind=>templates.localityKinds.find(item=>item.value===kind)?.label??kind).join(', ')}{template.scope.province?` thuộc ${template.scope.province}`:''}</small>}
            </label>;
          })}
        </div>
        <p className="field-hint">Bộ chỉ tiêu riêng của tỉnh chưa có trong thư viện: tạo "bộ tự đặt" ở trang Bộ chỉ tiêu sau khi thiết lập.</p>
      </>}

      {step===3&&<>
        <div className="panel-head"><div><h3>Thời hạn trách nhiệm</h3><p>Mọi trạng thái chờ đều có hạn; quá hạn thì hệ thống tự xử lý và ghi trách nhiệm. Đổi lại sau ở trang Cấu hình.</p></div></div>
        <div className="form-grid two">
          {SETTING_FIELDS.map(item=><label key={item.key}>{item.label} ({item.unit})
            <input type="number" min={item.min} max={item.max} value={settings[item.key]} onChange={event=>setSettings({...settings,[item.key]:Number(event.target.value)})}/>
            <small className="field-hint">{item.hint}</small>
          </label>)}
        </div>
      </>}

      {step===4&&<>
        <div className="panel-head"><div><h3>Xem lại và áp dụng</h3><p>Kiểm tra lần cuối trước khi áp dụng.</p></div></div>
        <dl className="dos-kv su-review">
          <div><dt>Đơn vị</dt><dd>{locality.name} — {locality.agencyName}{locality.provinceName?`, ${locality.provinceName}`:''} ({kindLabel})</dd></div>
          <div><dt>Tên ứng dụng</dt><dd>{brand}</dd></div>
          <div><dt>Phòng ban ({departments.filter(item=>item.selected).length})</dt><dd>{departments.filter(item=>item.selected).map(item=>item.name).join('; ')}</dd></div>
          <div><dt>Bộ chỉ tiêu năm {year}</dt><dd>{frameworkKeys.length?frameworkKeys.map(key=>templates.frameworkTemplates.find(item=>item.key===key)?.sampleName??key).join('; '):'Chưa chọn — có thể nạp sau'}</dd></div>
          <div><dt>Thời hạn</dt><dd>{SETTING_FIELDS.map(item=>`${item.label.toLowerCase()} ${settings[item.key]} ${item.unit}`).join(' · ')}</dd></div>
        </dl>
      </>}

      {stepError&&<div className="form-error" role="alert">{stepError}</div>}
      <div className="su-nav">
        <button type="button" className="btn secondary" disabled={step===0||busy} onClick={()=>go(step-1)}><ArrowLeft aria-hidden="true"/>Quay lại</button>
        {step<4
          ?<button type="button" className="btn primary" onClick={()=>go(step+1)}>Tiếp tục<ArrowRight aria-hidden="true"/></button>
          :<button type="button" className="btn primary" disabled={busy} onClick={()=>void apply()}><Wand2 aria-hidden="true"/>{busy?'Đang áp dụng… (có thể mất một phút)':'Áp dụng thiết lập'}</button>}
      </div>
    </section>
  </div>;
}
