// Kiểu dữ liệu của IOC bản 2: bộ chỉ tiêu, hồ sơ ba phần, trách nhiệm, kho dữ liệu.

export type FrameworkKind='PLAN'|'SCORE'|'TASK'|'STAT';
export type IssuingLevel='CENTRAL'|'PROVINCE'|'LOCAL';
export type ValueSource='MANUAL'|'COMPUTED'|'CHILDREN';
export type TargetStatusKey='NOT_STARTED'|'ON_TRACK'|'AT_RISK'|'OVERDUE'|'COMPLETED';
export type Frequency='MONTHLY'|'QUARTERLY'|'SEMIANNUAL'|'YEARLY';
export type DirectiveKind='KE_HOACH'|'CHUONG_TRINH'|'THONG_BAO_KET_LUAN'|'CONG_VAN'|'QUYET_DINH'|'NGHI_QUYET'|'CHI_THI'|'BAO_CAO'|'KHAC';
export type EvaluationResult='EXCEEDED'|'ACHIEVED'|'PARTIAL'|'NOT_ACHIEVED';

export const frameworkKindLabels:Record<FrameworkKind,string>={
  PLAN:'Kế hoạch – thực hiện',
  SCORE:'Chấm điểm',
  TASK:'Nhiệm vụ',
  STAT:'Thống kê',
};

export const issuingLevelLabels:Record<IssuingLevel,string>={
  CENTRAL:'Trung ương giao',
  PROVINCE:'Tỉnh/Thành phố giao',
  LOCAL:'Địa phương tự đặt',
};

export const frequencyLabels:Record<Frequency,string>={
  MONTHLY:'Hằng tháng',
  QUARTERLY:'Hằng quý',
  SEMIANNUAL:'6 tháng',
  YEARLY:'Hằng năm',
};

export const directiveKindLabels:Record<DirectiveKind,string>={
  KE_HOACH:'Kế hoạch',
  CHUONG_TRINH:'Chương trình',
  THONG_BAO_KET_LUAN:'Thông báo kết luận',
  CONG_VAN:'Công văn',
  QUYET_DINH:'Quyết định',
  NGHI_QUYET:'Nghị quyết',
  CHI_THI:'Chỉ thị',
  BAO_CAO:'Báo cáo',
  KHAC:'Văn bản khác',
};

export const evaluationLabels:Record<EvaluationResult,{label:string;tone:'ok'|'info'|'warn'|'bad'}>={
  EXCEEDED:{label:'Vượt',tone:'ok'},
  ACHIEVED:{label:'Đạt',tone:'info'},
  PARTIAL:{label:'Đạt một phần',tone:'warn'},
  NOT_ACHIEVED:{label:'Không đạt',tone:'bad'},
};

export type FrameworkSummary={
  total:number;
  counts:Record<TargetStatusKey,number>;
  progress:number|null;
  score:number|null;
  maxScore:number|null;
  reported:number;
  withDirective:number;
  withEvaluation:number;
};

export type Framework={
  id:string;
  code:string;
  name:string;
  kind:FrameworkKind;
  kindLabel:string;
  issuingLevel:IssuingLevel;
  issuingLevelLabel:string;
  year?:number|null;
  legalBasis?:string|null;
  description?:string|null;
  maxScore?:number|null;
  templateKey?:string|null;
  showOnWallboard:boolean;
  isActive:boolean;
  version:number;
  summary:FrameworkSummary;
};

export type FrameworkTemplate={
  key:string;
  kind:FrameworkKind;
  issuingLevel:IssuingLevel;
  legalBasis:string;
  description:string;
  maxScore:number|null;
  scope:{localityKinds:string[];province?:string};
  effectiveYear:number|null;
  targetCount:number;
  computedCount:number;
  datasetCount:number;
  sampleName:string;
  appliedYears?:(number|null)[];
};

export type TargetBrief={
  id:string;
  code:string;
  title:string;
  unit:string;
  kind:FrameworkKind;
  ordinal?:string|null;
  standardCode?:string|null;
  groupName?:string|null;
  targetValue:number;
  targetText?:string|null;
  currentValue:number;
  maxScore?:number|null;
  status:TargetStatusKey;
  progress:number;
  hasReport:boolean;
  lastReportedAt?:string|null;
  dueDate:string;
  departmentId:string;
  departmentName:string;
  departmentColor:string;
  assigneeName?:string|null;
  frameworkId?:string|null;
  parentId?:string|null;
  valueSource:ValueSource;
  issuingLevel:IssuingLevel;
};

export type AlertItem={
  severity:'critical'|'warning'|'info';
  kind:string;
  title:string;
  detail:string;
  targetId?:string;
  candidateId?:string;
  departmentName?:string|null;
  at?:string|null;
};

export type OverviewDepartment={
  id:string;
  name:string;
  color:string;
  total:number;
  completed:number;
  onTrack:number;
  atRisk:number;
  overdue:number;
  notStarted:number;
  missingReports:number;
  unassigned:number;
  pendingReports:number;
  oldestPendingDays:number;
  openExplanations:number;
  withDirective:number;
  withEvaluation:number;
  reported:number;
  statTotal:number;
  statReported:number;
  progress:number;
  managers:{id:string;fullName:string;lastLoginAt?:string|null}[];
};

export type WorkEventItem={
  id:string;
  action:string;
  label:string;
  actorName:string;
  note?:string|null;
  createdAt:string;
  target?:{id:string;code:string;title:string}|null;
  candidate?:{id:string;name:string}|null;
};

export type Overview={
  year:number;
  generatedAt:string;
  dataAsOf?:string|null;
  scope:'department'|'locality';
  totals:{
    targets:number;completed:number;onTrack:number;atRisk:number;overdue:number;notStarted:number;progress:number;
    statTotal:number;statReported:number;missingReports:number;unassigned:number;pendingReports:number;pendingProposals:number;
    openExplanations:number;stalled:number;withDirective:number;withEvaluation:number;feedbackOpen:number;feedbackOverdue:number;
  };
  frameworks:(Pick<Framework,'id'|'code'|'name'|'kind'|'kindLabel'|'issuingLevel'|'issuingLevelLabel'|'legalBasis'|'showOnWallboard'>&{summary:FrameworkSummary;missingReports:number})[];
  departments:OverviewDepartment[];
  alerts:AlertItem[];
  stalled:(TargetBrief&{bounceCount:number;reason:string})[];
  recent:WorkEventItem[];
};

export type Evidence={
  id:string;
  title:string;
  kind:'FILE'|'LINK'|'DOCUMENT';
  mimeType?:string|null;
  size?:number|null;
  url?:string|null;
  note?:string|null;
  capturedAt?:string|null;
  createdAt:string;
  createdByName?:string;
  sourceDocumentId?:string|null;
};

export type Directive={
  id:string;
  kind:DirectiveKind;
  kindLabel:string;
  docNumber?:string|null;
  title:string;
  issuedDate?:string|null;
  issuer?:string|null;
  note?:string|null;
  createdByName:string;
  createdAt:string;
  sourceDocument?:{id:string;code:string;title:string}|null;
  evidences:Evidence[];
};

export type Report={
  id:string;
  value:number;
  valueText?:string|null;
  periodKey?:string|null;
  periodLabel?:string|null;
  dataSource?:string|null;
  explanation?:string|null;
  note?:string|null;
  reviewStatus:'PENDING'|'APPROVED'|'REJECTED';
  reviewNote?:string|null;
  reviewerName?:string|null;
  reviewedAt?:string|null;
  autoApproved:boolean;
  createdAt:string;
  user:{id:string;fullName:string};
  evidences:Evidence[];
};

export type Evaluation={
  id:string;
  periodKey:string;
  periodLabel:string;
  result:EvaluationResult;
  resultLabel:string;
  score?:number|null;
  note?:string|null;
  correctiveAction?:string|null;
  evaluatedByName:string;
  evaluatedAt:string;
  version:number;
};

export type ExplanationRequest={
  id:string;
  message:string;
  dueAt:string;
  status:'OPEN'|'ANSWERED'|'CANCELLED';
  response?:string|null;
  responderName?:string|null;
  respondedAt?:string|null;
  createdAt:string;
  version:number;
  requestedBy:{fullName:string;position?:string|null};
};

export type DossierPermissions={
  canReport:boolean;
  canContribute:boolean;
  canAssign:boolean;
  canTransfer:boolean;
  canReturn:boolean;
  canEvaluate:boolean;
  canRequestExplanation:boolean;
  canRespondExplanation:boolean;
  canEditSourceCard:boolean;
};

export type FormulaTrace={dataset:string;agg:string;column?:string;matched:number;total:number;value:number|null};

export type Dossier={
  id:string;
  code:string;
  title:string;
  description?:string|null;
  unit:string;
  kind:FrameworkKind;
  issuingLevel:IssuingLevel;
  ordinal?:string|null;
  standardCode?:string|null;
  groupName?:string|null;
  targetValue:number;
  targetText?:string|null;
  currentValue:number;
  maxScore?:number|null;
  scoringRule?:string|null;
  evidenceRequirement?:string|null;
  dataSourceSystem?:string|null;
  dataSourceAgency?:string|null;
  collectionGuide?:string|null;
  dataSourceUrl?:string|null;
  reportDueDay?:number|null;
  valueSource:ValueSource;
  frequency:Frequency;
  direction:'HIGHER_IS_BETTER'|'LOWER_IS_BETTER';
  year:number;
  dueDate:string;
  legalBasis?:string|null;
  version:number;
  transferCount:number;
  bounceCount:number;
  isArchived:boolean;
  lastReportedAt?:string|null;
  status:TargetStatusKey;
  progress:number;
  department:{id:string;code:string;name:string;color:string};
  framework?:{id:string;code:string;name:string;kind:FrameworkKind;issuingLevel:IssuingLevel;legalBasis?:string|null;maxScore?:number|null}|null;
  parent?:{id:string;code:string;title:string}|null;
  children:{id:string;code:string;title:string;unit:string;targetValue:number;targetText?:string|null;currentValue:number;maxScore?:number|null;kind:FrameworkKind;lastReportedAt?:string|null;ordinal?:string|null;standardCode?:string|null;department:{id:string;name:string;color:string};assignee?:{id:string;fullName:string}|null}[];
  coordinators:{department:{id:string;name:string;color:string}}[];
  assignee?:{id:string;fullName:string;position?:string|null;username:string}|null;
  sourceDocument?:{id:string;code:string;title:string;docNumber?:string|null}|null;
  directives:Directive[];
  reports:Report[];
  evaluations:(Evaluation&{evidences:Evidence[]})[];
  evidences:Evidence[];
  workEvents:(WorkEventItem&{responsibleUserId?:string|null})[];
  explanationRequests:ExplanationRequest[];
  currentPeriodKey:string;
  periods:{key:string;label:string;deadline:string;overdue:boolean;reported:boolean}[];
  completeness:{directive:boolean;execution:boolean;evaluation:boolean};
  formula?:{text:string;result:{value:number|null;score:number|null;traces:FormulaTrace[];warnings:string[]};datasets:{code:string;name:string;builtin:boolean}[]}|null;
  managers:{id:string;fullName:string;position?:string|null;lastLoginAt?:string|null}[];
  staff:{id:string;fullName:string;position?:string|null;role:string}[];
  maxTransfers:number;
  permissions:DossierPermissions;
};

export type MyWork={
  year:number;
  generatedAt:string;
  counts:{needReport:number;rejectedReports:number;toReview:number;proposals:number;explanations:number;unassigned:number;unread:number};
  needReport:(TargetBrief&{currentPeriod:string;currentPeriodKey?:string;missingPeriods:string[];missingPeriodKeys?:string[];pendingReport:boolean})[];
  rejectedReports:{id:string;value:number;reviewNote?:string|null;reviewedAt?:string|null;target:{id:string;code:string;title:string}}[];
  toReview:{id:string;createdAt:string;days:number;target:TargetBrief}[];
  proposals:{id:string;name:string;status:string;origin:'AI'|'HUMAN';autoApproveAt?:string|null;submittedAt?:string|null;createdAt:string;responsibleDepartment?:{name:string}|null;document?:{code:string;title:string}|null}[];
  explanations:(TargetBrief&{request:{id:string;dueAt:string;message:string}})[];
  unassigned:TargetBrief[];
  myTargets:TargetBrief[];
  myProposals:{id:string;name:string;status:string;autoApproveAt?:string|null;reviewNote?:string|null;createdTarget?:{id:string;code:string}|null;createdAt:string}[];
};

export type NotificationItem={
  id:string;
  kind:string;
  title:string;
  body?:string|null;
  link?:string|null;
  readAt?:string|null;
  createdAt:string;
};

export type DatasetColumn={key:string;label:string;type:'text'|'number'|'date'|'boolean'|'enum';required?:boolean;options?:string[]};

export type Dataset={
  id?:string;
  code:string;
  name:string;
  description?:string|null;
  builtin:boolean;
  columns:DatasetColumn[];
  rowCount:number|null;
  lastDataAt?:string|null;
  ownerDepartment?:{id:string;name:string}|null;
  updateCycle?:string|null;
  sourceSystem?:string|null;
  collectionGuide?:string|null;
  version?:number;
  canEdit:boolean;
  usedBy:{id:string;code:string;title:string;framework?:string|null}[];
};

export type Proposal={
  id:string;
  name:string;
  status:'PROPOSED'|'SUBMITTED'|'APPROVED'|'REJECTED';
  origin:'AI'|'HUMAN';
  description?:string|null;
  unit?:string|null;
  targetValue?:number|null;
  targetText?:string|null;
  targetYear?:number|null;
  frequency?:Frequency|null;
  deadline?:string|null;
  direction?:'HIGHER_IS_BETTER'|'LOWER_IS_BETTER'|null;
  responsibleDepartmentId?:string|null;
  responsibleDepartment?:{id:string;code:string;name:string}|null;
  responsibleDepartmentName?:string|null;
  frameworkId?:string|null;
  framework?:{id:string;code:string;name:string;kind:FrameworkKind}|null;
  legalBasis?:string|null;
  sourceQuote?:string;
  confidence:number;
  document?:{id:string;code:string;title:string;docNumber?:string|null}|null;
  proposedByName?:string|null;
  submittedAt?:string|null;
  autoApproveAt?:string|null;
  autoApproved:boolean;
  reviewNote?:string|null;
  reviewedBy?:{fullName:string}|null;
  reviewedAt?:string|null;
  createdTarget?:{id:string;code:string;title:string}|null;
  isDuplicateSuspect:boolean;
  version:number;
  createdAt:string;
  canEdit:boolean;
  canDecide:boolean;
};
