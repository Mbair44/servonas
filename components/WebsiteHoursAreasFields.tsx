const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

type HoursRow={weekday:number;start_time:string;end_time:string};
type AreaRow={id:string;name:string};

export function WebsiteHoursAreasFields({hours,areas,disabled}:{hours:HoursRow[];areas:AreaRow[];disabled:boolean}){
 const byDay=new Map(hours.map(row=>[row.weekday,row]));
 return <section className="workspace-panel website-setting-section website-hours-areas-section">
  <header><div><span>04</span><h2>Hours &amp; service areas</h2><p>Set when customers can book and the communities shown on your website.</p></div></header>
  <div className="website-inline-hours"><div className="website-feature-group-heading"><strong>Business hours</strong><span>Closed days will not be available for online booking.</span></div>{days.map((day,index)=>{const row=byDay.get(index);return <div className="website-inline-hour" key={day}><label><input type="checkbox" name={`websiteDay_${index}`} defaultChecked={Boolean(row)} disabled={disabled}/><strong>{day}</strong></label><input aria-label={`${day} opening time`} type="time" name={`websiteStart_${index}`} defaultValue={row?.start_time?.slice(0,5)??"09:00"} disabled={disabled}/><span>to</span><input aria-label={`${day} closing time`} type="time" name={`websiteEnd_${index}`} defaultValue={row?.end_time?.slice(0,5)??"17:00"} disabled={disabled}/></div>})}</div>
  <div className="website-inline-areas"><div className="website-feature-group-heading"><strong>Service areas</strong><span>Rename an area, remove it from the website, or add another community.</span></div>{areas.map(area=><div className="website-inline-area" key={area.id}><input type="hidden" name="websiteAreaId" value={area.id}/><input aria-label="Service area name" name="websiteAreaName" defaultValue={area.name} maxLength={150} disabled={disabled}/><label><input type="checkbox" name="websiteRemoveAreaId" value={area.id} disabled={disabled}/> Remove</label></div>)}<label>Add service areas<textarea name="websiteNewAreas" rows={3} maxLength={1000} placeholder="One city or service area per line" disabled={disabled}/><small>For example: Gilbert, Mesa, Chandler</small></label></div>
 </section>;
}
