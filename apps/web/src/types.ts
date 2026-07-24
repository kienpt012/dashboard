export type Role='ADMIN'|'MANAGER'|'STAFF'|'VIEWER';
export type ScopeKind='GLOBAL'|'DEPARTMENT';

export type Department={id:string;code:string;name:string;color:string;description?:string;isActive:boolean;version:number;_count?:{users:number;targets:number;feedbacks?:number}};
export type Target={
  id:string;
  code:string;
  title:string;
  description?:string;
  unit:string;
  targetValue:number;
  currentValue:number;
  weight:number;
  year:number;
  frequency:'MONTHLY'|'QUARTERLY'|'YEARLY';
  direction:'HIGHER_IS_BETTER'|'LOWER_IS_BETTER';
  status:string;
  dueDate:string;
  version:number;
  publicationVersion:number;
  isArchived:boolean;
  archivedAt?:string|null;
  archivedBy?:string|null;
  archiveReason?:string|null;
  isPublic:boolean;
  isHighlighted:boolean;
  publicOrder?:number|null;
  lastReportedAt?:string|null;
  publishedValue?:number|null;
  publishedTargetValue?:number|null;
  publishedDirection?:'HIGHER_IS_BETTER'|'LOWER_IS_BETTER'|null;
  publishedStatus?:string|null;
  publishedCode?:string|null;
  publishedTitle?:string|null;
  publishedDescription?:string|null;
  publishedUnit?:string|null;
  publishedWeight?:number|null;
  publishedYear?:number|null;
  publishedFrequency?:'MONTHLY'|'QUARTERLY'|'YEARLY'|null;
  publishedDueDate?:string|null;
  publishedDepartmentName?:string|null;
  publishedDepartmentColor?:string|null;
  publishedHighlighted?:boolean|null;
  publishedOrder?:number|null;
  publishedAt?:string|null;
  publishedBy?:string|null;
  progress?:number;
  pendingUpdates?:number;
  department:Department;
};
export type User={
  id:string;
  username:string;
  fullName:string;
  email?:string;
  role:Role;
  isActive:boolean;
  departmentId?:string|null;
  department?:Department|null;
  lastLoginAt?:string|null;
  version:number;
};

export type DataScope={kind:ScopeKind;departmentId?:string;departmentName?:string};
export type ScopedResponse<T>={data:T;scope:DataScope};
export type AuthMeResponse=User|{user:User;scope?:DataScope};
export const statusMeta:Record<string,{label:string;color:string}>={NOT_STARTED:{label:'Chưa bắt đầu',color:'slate'},ON_TRACK:{label:'Đúng tiến độ',color:'green'},AT_RISK:{label:'Có rủi ro',color:'amber'},OVERDUE:{label:'Quá hạn',color:'red'},COMPLETED:{label:'Hoàn thành',color:'blue'}};

export type FeedbackCategory=
  |'INFRASTRUCTURE'
  |'ENVIRONMENT'
  |'ADMINISTRATIVE_PROCEDURE'
  |'SECURITY_ORDER'
  |'SOCIAL_WELFARE'
  |'CULTURE_EDUCATION'
  |'OTHER';

export type FeedbackPriority='LOW'|'NORMAL'|'HIGH'|'URGENT';
export type FeedbackStatus=
  |'RECEIVED'
  |'ASSIGNED'
  |'IN_PROGRESS'
  |'WAITING_CITIZEN'
  |'PENDING_REVIEW'
  |'RESOLVED'
  |'CLOSED'
  |'REJECTED'
  |'REOPENED';
export type FeedbackMessageVisibility='INTERNAL'|'PUBLIC';

export type FeedbackMessage={
  id:string;
  body:string;
  visibility?:FeedbackMessageVisibility;
  authorId?:string|null;
  authorName:string;
  createdAt:string;
};

export type FeedbackEvent={
  id:string;
  action:string;
  fromStatus?:FeedbackStatus|null;
  toStatus?:FeedbackStatus|null;
  actorId?:string|null;
  actorName?:string;
  note?:string|null;
  createdAt:string;
};

export type FeedbackAttachment={
  id:string;
  originalName:string;
  mimeType:string;
  size:number;
  sha256?:string;
  createdAt:string;
};

export type Feedback={
  id:string;
  code:string;
  title:string;
  content:string;
  category:FeedbackCategory;
  priority:FeedbackPriority;
  status:FeedbackStatus;
  submitterName:string;
  submitterPhone:string;
  submitterEmail?:string|null;
  address?:string|null;
  preferredContact:'PHONE'|'EMAIL';
  departmentId?:string|null;
  department?:Department|null;
  assignedToId?:string|null;
  assignedTo?:Pick<User,'id'|'username'|'fullName'|'role'|'departmentId'|'isActive'>|null;
  dueAt?:string|null;
  firstResponseDueAt?:string|null;
  firstResponseAt?:string|null;
  waitingCitizenAt?:string|null;
  citizenResponseDueAt?:string|null;
  submittedForReviewAt?:string|null;
  submittedForReviewBy?:string|null;
  resolvedAt?:string|null;
  closedAt?:string|null;
  resolutionSummary?:string|null;
  rejectionReason?:string|null;
  closureReason?:'RESOLVED'|'NO_CITIZEN_RESPONSE'|'OUT_OF_SCOPE'|null;
  version:number;
  reopenCount:number;
  reopenRequestedAt?:string|null;
  reopenRequestReason?:string|null;
  reopenRequestCount:number;
  reopenRequestDecision?:'APPROVED'|'REJECTED'|null;
  reopenRequestDecisionNote?:string|null;
  reopenRequestReviewedAt?:string|null;
  rating?:number|null;
  ratingComment?:string|null;
  ratedAt?:string|null;
  isPublic:boolean;
  publicTitle?:string|null;
  publicSummary?:string|null;
  publicPublishedAt?:string|null;
  createdAt:string;
  updatedAt:string;
  messages?:FeedbackMessage[];
  events?:FeedbackEvent[];
  attachments?:FeedbackAttachment[];
  _count?:{messages:number;attachments?:number};
};

export type FeedbackListResponse={items:Feedback[];total:number;page:number;pageSize:number};
export type FeedbackStats={
  total:number;
  received:number;
  inProgress:number;
  awaitingCitizen:number;
  waitingCitizenExpired:number;
  pendingReview:number;
  reopenRequested:number;
  resolved:number;
  overdue:number;
  dueSoon:number;
  averageRating:number|null;
  ratingCount:number;
};

export type PublicFeedbackCreated={
  code:string;
  lookupSecret:string;
  status:FeedbackStatus;
  createdAt:string;
  version:number;
  message:string;
};

export type PublicFeedbackMessage=Pick<FeedbackMessage,'body'|'authorName'|'createdAt'>;
export type PublicFeedbackEvent = Pick<
  FeedbackEvent,
  'action' | 'fromStatus' | 'toStatus' | 'createdAt'
>;

export type PublicFeedbackDetail=Pick<Feedback,
  'code'|'title'|'content'|'category'|'priority'|'status'|'address'|'dueAt'|'firstResponseDueAt'|'firstResponseAt'|'waitingCitizenAt'|'citizenResponseDueAt'|'resolvedAt'|'closedAt'|'resolutionSummary'|'rejectionReason'|'closureReason'|'rating'|'ratingComment'|'reopenRequestedAt'|'reopenRequestReason'|'reopenRequestCount'|'reopenRequestDecision'|'reopenRequestDecisionNote'|'reopenRequestReviewedAt'|'createdAt'|'updatedAt'|'version'
>&{
  departmentName?:string|null;
  messages:PublicFeedbackMessage[];
  events:PublicFeedbackEvent[];
  attachments:FeedbackAttachment[];
};

export type PublishedFeedback={
  code:string;
  category:FeedbackCategory|null;
  publicTitle:string|null;
  publicSummary:string|null;
  publicPublishedAt:string;
  resolvedAt:string|null;
  department:{name:string}|null;
};

export type PublishedFeedbackDetail={
  code:string;
  category:FeedbackCategory;
  status:FeedbackStatus;
  title:string;
  content:string;
  resolutionSummary:string|null;
  departmentName:string|null;
  createdAt:string;
  resolvedAt:string|null;
  closedAt:string|null;
  publishedAt:string;
  timeline:PublicFeedbackEvent[];
  messages:PublicFeedbackMessage[];
};

export type PublicTarget={
  key:string;
  code:string;
  title:string;
  description?:string|null;
  unit:string;
  year:number;
  frequency:'MONTHLY'|'QUARTERLY'|'YEARLY';
  dueDate:string;
  targetValue:number;
  currentValue:number;
  progress:number;
  department:string;
  departmentColor:string;
  departmentKey:string;
  status:string;
  publishedAt:string|null;
};

export type PublicOverview={
  year:number;
  total:number;
  completed:number;
  onTrack:number;
  overallProgress:number;
  updatedAt:string|null;
  departments:Array<{key:string;name:string;color:string;total:number;completed:number;progress:number}>;
  highlights:PublicTarget[];
};

export type PublicTargetListResponse={
  year:number;
  items:PublicTarget[];
  total:number;
  page:number;
  pageSize:number;
  pageCount:number;
  department:string|null;
};
