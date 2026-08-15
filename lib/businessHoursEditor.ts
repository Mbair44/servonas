export type BusinessHoursValue={weekday:number;open:boolean;start:string;end:string};
export type BusinessHoursPreset="weekdays"|"saturday"|"daily"|"custom";
export const defaultBusinessHoursValues=()=>Array.from({length:7},(_,weekday)=>({weekday,open:weekday>=1&&weekday<=5,start:"09:00",end:"17:00"}));
const matches=(rows:BusinessHoursValue[],openDays:number[])=>rows.every(row=>row.open===openDays.includes(row.weekday))&&new Set(rows.filter(row=>row.open).map(row=>`${row.start}-${row.end}`)).size<=1;
export const detectBusinessHoursPreset=(rows:BusinessHoursValue[]):BusinessHoursPreset=>matches(rows,[1,2,3,4,5])?"weekdays":matches(rows,[1,2,3,4,5,6])?"saturday":matches(rows,[0,1,2,3,4,5,6])?"daily":"custom";
export const applyBusinessHoursPreset=(rows:BusinessHoursValue[],next:Exclude<BusinessHoursPreset,"custom">)=>{const openDays=next==="weekdays"?[1,2,3,4,5]:next==="saturday"?[1,2,3,4,5,6]:[0,1,2,3,4,5,6],source=rows.find(row=>row.open)??rows.find(row=>row.weekday===1)??defaultBusinessHoursValues()[1];return rows.map(row=>({...row,open:openDays.includes(row.weekday),start:source.start,end:source.end}));};
