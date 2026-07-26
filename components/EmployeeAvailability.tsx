type Interval={id:string;weekday:number;interval_type:string;starts_at:string;ends_at:string};
type Profile={time_zone:string;maximum_daily_jobs:number|null;maximum_daily_minutes:number|null;overtime_preference:string};
type Exception={id:string;exception_type:string;starts_at:string;ends_at:string;availability_effect:string;approval_status:string;reason:string|null};
const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const zones=["America/Phoenix","America/Los_Angeles","America/Denver","America/Chicago","America/New_York","UTC"];
const time=(value:string|undefined,fallback:string)=>value?.slice(0,5)??fallback;

export function EmployeeAvailability({profile,intervals,exceptions,canEdit,saveAction,addExceptionAction,deleteExceptionAction}:{
 profile:Profile;intervals:Interval[];exceptions:Exception[];canEdit:boolean;
 saveAction:(formData:FormData)=>void|Promise<void>;
 addExceptionAction:(formData:FormData)=>void|Promise<void>;
 deleteExceptionAction:(formData:FormData)=>void|Promise<void>;
}){
 const byDay=(weekday:number,type:string)=>intervals.find(item=>item.weekday===weekday&&item.interval_type===type);
 const zoneOptions=zones.includes(profile.time_zone)?zones:[profile.time_zone,...zones];
 return <section className="workspace-panel employee-availability">
  <div className="panel-title"><div><span className="sv-kicker">Capacity and time</span><h2>Availability</h2><p>Recurring hours use the employee’s local time. Exceptions are stored as UTC instants.</p></div></div>
  <form action={saveAction} className="employee-availability-form"><fieldset disabled={!canEdit}>
   <div className="availability-settings">
    <label>Time zone<select name="timeZone" defaultValue={profile.time_zone}>{zoneOptions.map(zone=><option key={zone}>{zone}</option>)}</select></label>
    <label>Maximum daily jobs<input type="number" min="1" max="100" name="maximumDailyJobs" defaultValue={profile.maximum_daily_jobs??""} placeholder="No limit"/></label>
    <label>Maximum daily hours<input type="number" min=".5" max="24" step=".5" name="maximumDailyHours" defaultValue={profile.maximum_daily_minutes===null?"":profile.maximum_daily_minutes/60} placeholder="No limit"/></label>
    <label>Overtime preference<select name="overtimePreference" defaultValue={profile.overtime_preference}><option value="avoid">Avoid</option><option value="ask">Ask first</option><option value="allowed">Allowed</option><option value="preferred">Preferred</option></select></label>
   </div>
   <div className="employee-weekly-schedule">{days.map((day,weekday)=>{const work=byDay(weekday,"working"),breakValue=byDay(weekday,"break");return <div className="employee-day" key={day}>
    <label className="employee-day-toggle"><input type="checkbox" name={`day_${weekday}`} defaultChecked={!!work}/><strong>{day}</strong></label>
    <label>Starts<input type="time" name={`start_${weekday}`} defaultValue={time(work?.starts_at,"09:00")}/></label>
    <label>Ends<input type="time" name={`end_${weekday}`} defaultValue={time(work?.ends_at,"17:00")}/></label>
    <label className="employee-day-toggle"><input type="checkbox" name={`break_${weekday}`} defaultChecked={!!breakValue}/> Break</label>
    <label>Break starts<input type="time" name={`breakStart_${weekday}`} defaultValue={time(breakValue?.starts_at,"12:00")}/></label>
    <label>Break ends<input type="time" name={`breakEnd_${weekday}`} defaultValue={time(breakValue?.ends_at,"12:30")}/></label>
   </div>})}</div>
   {canEdit&&<button className="sv-button">Save availability</button>}
  </fieldset></form>
  <div className="availability-exceptions"><div><h3>Time off and exceptions</h3><p>PTO, vacation, holidays, sick time, and one-time breaks override the weekly schedule.</p></div>
   {canEdit&&<form action={addExceptionAction} className="availability-exception-form">
    <label>Type<select name="exceptionType"><option value="pto">PTO</option><option value="vacation">Vacation</option><option value="holiday">Holiday</option><option value="sick">Sick</option><option value="break">Break</option><option value="other">Other</option></select></label>
    <label>Starts<input required type="datetime-local" name="startsAt"/></label><label>Ends<input required type="datetime-local" name="endsAt"/></label>
    <label>Effect<select name="availabilityEffect"><option value="unavailable">Unavailable</option><option value="available">Available override</option></select></label>
    <label>Reason<input name="reason" maxLength={500}/></label><button className="sv-button sv-secondary">Add exception</button>
   </form>}
   <div className="availability-exception-list">{exceptions.length?exceptions.map(item=><article key={item.id}><div><strong>{item.exception_type.replace("_"," ")}</strong><span>{new Intl.DateTimeFormat("en-US",{timeZone:profile.time_zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(item.starts_at))} – {new Intl.DateTimeFormat("en-US",{timeZone:profile.time_zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(item.ends_at))}</span><small>{item.availability_effect==="available"?"Available override":"Unavailable"} · {item.approval_status}{item.reason?` · ${item.reason}`:""}</small></div>{canEdit&&<form action={deleteExceptionAction}><input type="hidden" name="exceptionId" value={item.id}/><button className="text-button danger">Remove</button></form>}</article>):<div className="dashboard-empty"><strong>No upcoming exceptions.</strong><p>This employee follows their weekly schedule.</p></div>}</div>
  </div>
 </section>;
}
