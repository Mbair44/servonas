export type RecurrenceUnit="day"|"week"|"month"|"year";
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month+1,0)).getUTCDate();
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
 if(value===1)return unit==="day"?"Daily":unit==="week"?"Weekly":unit==="month"?"Monthly":"Annually";
 return `Every ${value} ${unit}s`;
}
