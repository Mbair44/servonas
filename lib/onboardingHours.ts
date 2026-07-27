export type DayHours={weekday:number;open:boolean;start:string;end:string};
const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function defaultBusinessHours():DayHours[]{return Array.from({length:7},(_,weekday)=>({weekday,open:weekday>=1&&weekday<=5,start:"09:00",end:"17:00"}));}
export function validateBusinessHours(rows:DayHours[]){
 const errors:Record<number,string>={};
 if(rows.length!==7||new Set(rows.map(row=>row.weekday)).size!==7)return {form:"Business hours must include all seven days.",days:errors};
 for(const row of rows)if(row.open&&(!time.test(row.start)||!time.test(row.end)||row.end<=row.start))errors[row.weekday]="Closing time must be after opening time.";
 if(!rows.some(row=>row.open))return {form:"Choose at least one open day.",days:errors};
 return {form:null,days:errors};
}
