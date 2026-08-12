import {zonedDateTimeToUtc} from "../bookingTime.ts";

const weekdays=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const lead=/^(?:(?:will|can|could|would)\s+you\s+|please\s+)?(?:schedule|book|put|add|set\s+up|create\s+an?\s+appointment\s+for)\s+/i;

export type AppointmentCreateRequest={customerReference:string|null;customerFirstName:string|null;customerLastName:string|null;startsAt:string|null;needsMeridiem:boolean;title:string;durationMinutes:number};

/** Parses only high-confidence creation fields. It never guesses AM/PM. */
export function parseAppointmentCreateRequest(input:string,timeZone:string,now=new Date()):AppointmentCreateRequest|null{
 if(!lead.test(input.trim()))return null;
 const value=input.trim().replace(lead,"").replace(/[?.!]$/g,"");
 const timeMatch=value.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
 const hour=timeMatch?Number(timeMatch[1]):null,minute=timeMatch?Number(timeMatch[2]??0):0,meridiem=timeMatch?.[3]?.toLowerCase()??null;
 const needsMeridiem=hour!==null&&!meridiem;
 const localParts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",weekday:"long"}).formatToParts(now),part=(type:string)=>localParts.find(p=>p.type===type)?.value??"";
 const base=new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`);let offset:number|null=/\btomorrow\b/i.test(value)?1:/\btoday\b/i.test(value)?0:null;
 const weekday=weekdays.findIndex(day=>new RegExp(`\\b${day}\\b`,"i").test(value));if(weekday>=0){const current=weekdays.indexOf(part("weekday").toLowerCase());offset=(weekday-current+7)%7||7;}
 let startsAt:string|null=null;if(offset!==null&&hour!==null&&!needsMeridiem&&hour>=1&&hour<=12&&minute>=0&&minute<60){const target=new Date(base);target.setUTCDate(target.getUTCDate()+offset);const date=target.toISOString().slice(0,10),hour24=meridiem==="pm"?(hour%12)+12:hour%12;startsAt=zonedDateTimeToUtc(date,`${String(hour24).padStart(2,"0")}:${String(minute).padStart(2,"0")}`,timeZone).toISOString();}
 const reference=value.replace(/\b(?:for\s+)?(?:today|tomorrow|on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)?\b/gi," ").replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi," ").replace(/\b(?:on|for|to|my|the|calendar|schedule|appointment)\b/gi," ").replace(/\s+/g," ").trim();
 const pronoun=/^(?:him|her|them|this customer|that customer)$/i.test(reference);
 const customerReference=pronoun||!reference?null:reference,customerParts=customerReference?.split(/\s+/)??[];
 return{customerReference,customerFirstName:customerParts[0]??null,customerLastName:customerParts.length>1?customerParts.slice(1).join(" "):null,startsAt,needsMeridiem,title:"Service appointment",durationMinutes:60};
}
