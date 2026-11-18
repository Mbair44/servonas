import type { AssignedJobSummary, JobStatus } from "@servonas/shared";

export function statusLabel(status:JobStatus){return status.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}
export function timeLabel(value:string|null){
  if(!value)return "Time not scheduled";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Time not scheduled":new Intl.DateTimeFormat(undefined,{weekday:"short",hour:"numeric",minute:"2-digit"}).format(date);
}
export function jobSubtitle(job:Pick<AssignedJobSummary,"customerDisplayName"|"serviceName"|"serviceAddress">){
  return [job.customerDisplayName,job.serviceName,job.serviceAddress].filter(Boolean).join(" · ")||"Details available in the job";
}
