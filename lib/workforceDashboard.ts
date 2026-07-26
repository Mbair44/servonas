export type WorkforceDashboardEmployee={id:string;active:boolean;worksToday:boolean;unavailableToday:boolean;jobCount:number;qualificationCount:number;jobsCompleted:number;averageCompletionSeconds:number|null;revenueCents:number};
export function workforceStatus(employee:WorkforceDashboardEmployee){
 if(!employee.active)return "Inactive";
 if(employee.unavailableToday)return "On time off";
 if(employee.worksToday)return "Working today";
 return "Not scheduled";
}
export function workloadLabel(jobCount:number,maximumDailyJobs:number|null){
 if(jobCount===0)return "No jobs today";
 if(maximumDailyJobs&&jobCount>=maximumDailyJobs)return `${jobCount} jobs · at capacity`;
 return `${jobCount} job${jobCount===1?"":"s"} today`;
}
export function formatPerformance(employee:WorkforceDashboardEmployee){
 if(employee.jobsCompleted===0)return "No completed-job history yet";
 const duration=employee.averageCompletionSeconds===null?"duration pending":`${Math.round(employee.averageCompletionSeconds/60)} min avg`;
 return `${employee.jobsCompleted} completed · ${duration}`;
}
