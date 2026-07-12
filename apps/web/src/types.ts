export type Department={id:string;code:string;name:string;color:string;description?:string;isActive:boolean;_count?:{users:number;targets:number}};
export type Target={id:string;code:string;title:string;description?:string;unit:string;targetValue:number;currentValue:number;weight:number;year:number;frequency:string;status:string;dueDate:string;department:Department};
export type User={id:string;username:string;fullName:string;email?:string;role:string;isActive:boolean;department?:Department};
export const statusMeta:Record<string,{label:string;color:string}>={NOT_STARTED:{label:'Chưa bắt đầu',color:'slate'},ON_TRACK:{label:'Đúng tiến độ',color:'green'},AT_RISK:{label:'Có rủi ro',color:'amber'},OVERDUE:{label:'Quá hạn',color:'red'},COMPLETED:{label:'Hoàn thành',color:'blue'}};
