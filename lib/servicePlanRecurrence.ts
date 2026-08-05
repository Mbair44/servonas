export type RecurrenceUnit="day"|"week"|"month"|"month_weekday"|"year";
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month+1,0)).getUTCDate();
const isoDate=(year:number,month:number,day:number)=>`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
export function nextMonthlyDayAnchor(start:string,dayOfMonth:number){
 const [year,month,day]=start.split("-").map(Number);if(!year||!month||!day||!Number.isInteger(dayOfMonth)||dayOfMonth<1||dayOfMonth>31)throw new Error("Invalid monthly day");
 const candidateDay=Math.min(dayOfMonth,daysInMonth(year,month-1));
 if(candidateDay>=day)return isoDate(year,month-1,candidateDay);
 const nextMonth=month===12?0:month,nextYear=month===12?year+1:year;
 return isoDate(nextYear,nextMonth,Math.min(dayOfMonth,daysInMonth(nextYear,nextMonth)));
}
export function nextMonthlyWeekdayAnchor(start:string,ordinal:number,weekday:number){
 const [year,month,day]=start.split("-").map(Number);if(!year||!month||!day||!Number.isInteger(ordinal)||ordinal<1||ordinal>4||!Number.isInteger(weekday)||weekday<0||weekday>6)throw new Error("Invalid monthly weekday");
 const occurrence=(targetYear:number,targetMonth:number)=>{const firstWeekday=new Date(Date.UTC(targetYear,targetMonth,1)).getUTCDay();return 1+((weekday-firstWeekday+7)%7)+(ordinal-1)*7;};
 const candidate=occurrence(year,month-1);if(candidate>=day)return isoDate(year,month-1,candidate);
 const nextMonth=month===12?0:month,nextYear=month===12?year+1:year;return isoDate(nextYear,nextMonth,occurrence(nextYear,nextMonth));
}
export function nextOccurrenceDate(anchor:string,intervalValue:number,unit:RecurrenceUnit,index:number){
 if(!Number.isInteger(intervalValue)||intervalValue<1||!Number.isInteger(index)||index<0)throw new Error("Invalid recurrence interval");
 const [year,month,day]=anchor.split("-").map(Number);
 if(!year||!month||!day)throw new Error("Invalid recurrence anchor");
 if(unit==="day"||unit==="week"){
  const date=new Date(Date.UTC(year,month-1,day));
  date.setUTCDate(date.getUTCDate()+intervalValue*index*(unit==="week"?7:1));
  return date.toISOString().slice(0,10);
 }
 const totalMonths=(month-1)+(unit==="year"?intervalValue*12:intervalValue)*index;
 const targetYear=year+Math.floor(totalMonths/12),targetMonth=((totalMonths%12)+12)%12;
 if(unit==="month_weekday"){
  const ordinal=Math.ceil(day/7),weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();
  return nextMonthlyWeekdayAnchor(`${targetYear}-${String(targetMonth+1).padStart(2,"0")}-01`,ordinal,weekday);
 }
 const anchorIsMonthEnd=day===daysInMonth(year,month-1);
 const targetDay=anchorIsMonthEnd?daysInMonth(targetYear,targetMonth):Math.min(day,daysInMonth(targetYear,targetMonth));
 return `${targetYear}-${String(targetMonth+1).padStart(2,"0")}-${String(targetDay).padStart(2,"0")}`;
}
export function previewOccurrences(anchor:string,intervalValue:number,unit:RecurrenceUnit,count=6,endDate?:string|null){
 const result:string[]=[];
 for(let index=0;index<count;index++){const date=nextOccurrenceDate(anchor,intervalValue,unit,index);if(endDate&&date>endDate)break;result.push(date);}
 return result;
}
export function cadenceLabel(value:number,unit:RecurrenceUnit){
 if(value===1)return unit==="day"?"Daily":unit==="week"?"Weekly":unit==="month"||unit==="month_weekday"?"Monthly":"Annually";
 return `Every ${value} ${unit==="month_weekday"?"month":unit}s`;
}
