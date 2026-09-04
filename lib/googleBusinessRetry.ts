export type GoogleBusinessRetrySource="retry_after_header"|"google_retry_info"|"exponential_backoff"|"fallback";

export function formatGoogleBusinessRetryAt(value:string|null|undefined,timeZone:string,now=new Date()){
 if(!value)return null;
 const retryAt=new Date(value);
 if(Number.isNaN(retryAt.getTime()))return null;
 const time=new Intl.DateTimeFormat("en-US",{timeZone,hour:"numeric",minute:"2-digit"}).format(retryAt);
 const date=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"});
 const retryDate=date.format(retryAt),today=date.format(now);
 const tomorrowDate=new Date(now.getTime()+24*60*60_000);
 if(retryDate===today)return `Try again after ${time}`;
 if(retryDate===date.format(tomorrowDate))return `Try again tomorrow after ${time}`;
 const day=new Intl.DateTimeFormat("en-US",{timeZone,month:"short",day:"numeric"}).format(retryAt);
 return `Try again ${day} after ${time}`;
}

export function googleBusinessRetryMessage(source:GoogleBusinessRetrySource){
 return source==="retry_after_header"||source==="google_retry_info"
  ?"Google asked us to wait until the time shown below."
  :"Servonas is waiting briefly before the next account check to avoid making the limit worse.";
}
