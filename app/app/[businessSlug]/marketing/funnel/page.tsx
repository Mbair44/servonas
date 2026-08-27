import Link from "next/link";
import {WorkspaceNav} from "../../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";
import {addDays, dateInTimeZone, zonedDateTimeToUtc} from "@/lib/bookingTime";
import type {BookingFunnelEvent} from "@/lib/bookingFunnel";

const stages=["landing_page_view","check_availability_clicked","availability_date_selected","booking_started","customer_info_entered","checkout_started","booking_completed"] as const;
type StageName=(typeof stages)[number];
type SourceFilter="all"|"google";
type DateDemandDetail={itemId:string|null;itemName:string;count:number};
type DateDemandDay={date:string;count:number;uniqueItems:number;topItems:DateDemandDetail[]};

const journeyShort:Record<StageName,string>={
 landing_page_view:"Landing",
 check_availability_clicked:"Availability",
 availability_date_selected:"Date selected",
 booking_started:"Booking started",
 customer_info_entered:"Customer info",
 checkout_started:"Checkout",
 booking_completed:"Booked",
};

type EventRow={
 event_name:BookingFunnelEvent;
 inventory_item_id?:string|null;
 booking_total_cents:number|null;
 metadata:Record<string,unknown>|null;
 inventory_items?:{name?:string|null}|{name?:string|null}[]|null;
 booking_attribution_sessions?:{utm_source?:string|null;gclid?:string|null;gbraid?:string|null;wbraid?:string|null}|{utm_source?:string|null;gclid?:string|null;gbraid?:string|null;wbraid?:string|null}[]|null;
};

const percent=(value:number,total:number)=>total?Math.round(value/total*100):null;
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const displayRate=(value:number,total:number)=>{const result=percent(value,total);return result==null?"—":`${result}%`;};
const validDate=(value:string|undefined)=>Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value));
const validMonth=(value:string|undefined)=>Boolean(value&&/^\d{4}-\d{2}$/.test(value));
const monthStart=(value:string)=>`${value.slice(0,8)}01`;
const monthKeyOf=(value:string)=>value.slice(0,7);
const monthTitle=(value:string)=>new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}-01T12:00:00Z`));
const monthShortTitle=(value:string)=>new Intl.DateTimeFormat("en-US",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(`${value}-01T12:00:00Z`));
const monthBounds=(value:string)=>{
 const [year,month]=value.split("-").map(Number);
 const first=new Date(Date.UTC(year,month-1,1,12));
 const next=new Date(Date.UTC(year,month,1,12));
 const last=new Date(next.getTime()-24*60*60*1000);
 return {first:`${value}-01`,last:last.toISOString().slice(0,10),daysInMonth:last.getUTCDate(),firstWeekday:first.getUTCDay()};
};
const shiftMonth=(value:string,offset:number)=>{
 const [year,month]=value.split("-").map(Number);
 const next=new Date(Date.UTC(year,month-1+offset,1,12));
 return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,"0")}`;
};
const sourceOf=(row:EventRow)=>{const relation=Array.isArray(row.booking_attribution_sessions)?row.booking_attribution_sessions[0]:row.booking_attribution_sessions;if(!relation)return "Direct";if(relation.gclid||relation.gbraid||relation.wbraid||/google/i.test(relation.utm_source??""))return "Google Ads";if(relation.utm_source)return relation.utm_source;return "Direct";};

function stageCount(rows:EventRow[],name:StageName,source:SourceFilter){
 return rows.filter(row=>row.event_name===name&&(source==="all"||sourceOf(row)==="Google Ads")).length;
}

function stageRevenue(rows:EventRow[],source:string){
 return rows.filter(row=>row.event_name==="booking_completed"&&sourceOf(row)===source).reduce((sum,row)=>sum+Number(row.booking_total_cents??0),0);
}

function sourceCount(rows:EventRow[],source:string,stage:StageName){
 return rows.filter(row=>row.event_name===stage&&sourceOf(row)===source).length;
}

function inventoryNameOf(row:EventRow){
 const relation=Array.isArray(row.inventory_items)?row.inventory_items[0]:row.inventory_items;
 return relation?.name?.trim()||null;
}

function isInventoryClick(row:EventRow){
 return row.event_name==="inventory_item_clicked"||(row.event_name==="inventory_item_view"&&row.metadata?.click_intent===true);
}

function metadataDateValues(row:EventRow){
 const values=[row.metadata?.date,row.metadata?.range_end].filter((value):value is string=>typeof value==="string"&&validDate(value));
 return [...new Set(values)];
}

function dateDemandSummary(rows:EventRow[],source:SourceFilter){
 const days=new Map<string,{count:number;items:Map<string,{itemName:string;count:number}>}>();
 for(const row of rows){
  if(source==="google"&&sourceOf(row)!=="Google Ads")continue;
  if(row.event_name!=="event_date_selected"&&row.event_name!=="event_date_changed")continue;
  const dates=metadataDateValues(row);
  if(!dates.length)continue;
  const itemId=row.inventory_item_id??null;
  const itemName=inventoryNameOf(row)??"General demand";
  for(const date of dates){
   const existing=days.get(date)??{count:0,items:new Map<string,{itemName:string;count:number}>()};
   existing.count++;
   const itemKey=itemId??"general";
   const itemExisting=existing.items.get(itemKey)??{itemName,count:0};
   itemExisting.count++;
   existing.items.set(itemKey,itemExisting);
   days.set(date,existing);
  }
 }
 return [...days.entries()].map(([date,value])=>({
  date,
  count:value.count,
  uniqueItems:value.items.size,
  topItems:[...value.items.entries()].map(([itemId,item])=>({itemId:itemId==="general"?null:itemId,itemName:item.itemName,count:item.count})).sort((a,b)=>b.count-a.count||a.itemName.localeCompare(b.itemName)).slice(0,4),
 } satisfies DateDemandDay)).sort((a,b)=>a.date.localeCompare(b.date));
}

export default async function BookingFunnelPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{from?:string;to?:string;source?:string;month?:string;date?:string}>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
 const canViewMarketing=canManageBusiness(role);
 const today=dateInTimeZone(new Date(),business.timezone);
 const to=validDate(q.to)?q.to!:today;
 const from=validDate(q.from)?q.from!:monthStart(to);
 const source=(q.source==="google"?"google":"all") as SourceFilter;
 if(!canViewMarketing)return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can view marketing analytics.</div></section></main>;

 const rangeStart=zonedDateTimeToUtc(from,"00:00",business.timezone).toISOString();
 const rangeEnd=zonedDateTimeToUtc(addDays(to,1),"00:00",business.timezone).toISOString();
 let query=supabase.from("booking_funnel_events").select("event_name,inventory_item_id,booking_total_cents,metadata,inventory_items(name),booking_attribution_sessions!inner(utm_source,gclid,gbraid,wbraid)").eq("business_id",business.id).gte("occurred_at",rangeStart).lt("occurred_at",rangeEnd);
 if(source==="google")query=query.or("gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null,utm_source.ilike.google",{foreignTable:"booking_attribution_sessions"});
 const {data,error}=await query;

 const rows=(data??[]) as EventRow[];
 const counts=Object.fromEntries(stages.map(name=>[name,stageCount(rows,name,source)])) as Record<StageName,number>;
 const revenue=rows.filter(row=>row.event_name==="booking_completed").reduce((sum,row)=>sum+Number(row.booking_total_cents??0),0);
 const completedBookings=counts.booking_completed;
 const trafficSources=[...new Set(rows.map(sourceOf))].sort((a,b)=>a==="Google Ads"?-1:b==="Google Ads"?1:a.localeCompare(b));
 const sourceRows=trafficSources.map(name=>({name,visits:sourceCount(rows,name,"landing_page_view"),availability:sourceCount(rows,name,"check_availability_clicked"),bookings:sourceCount(rows,name,"booking_completed"),revenue:stageRevenue(rows,name)})).filter(row=>row.visits||row.availability||row.bookings||row.revenue);
 const transitions=stages.slice(1).map((stage,index)=>{const previous=stages[index],fromCount=counts[previous],toCount=counts[stage],continued=percent(toCount,fromCount),drop=fromCount>0?Math.max(0,fromCount-toCount):0,dropRate=fromCount>0?Math.round((drop/fromCount)*100):null;return {from:previous,to:stage,fromCount,toCount,continued,drop,dropRate};});
 const biggestDrop=transitions.filter(item=>item.fromCount>0&&item.drop>0&&item.dropRate!==null).sort((a,b)=>(b.dropRate??0)-(a.dropRate??0)||b.drop-a.drop)[0]??null;
 const noActivity=!rows.length;
 const noBookings=!noActivity&&completedBookings===0;
 const avgCompletedBooking=completedBookings?Math.round(revenue/completedBookings):0;
 const quickRanges=[{label:"Last 7 days",from:addDays(to,-6),to},{label:"Last 30 days",from:addDays(to,-29),to},{label:"This month",from:monthStart(to),to}];
 const demandDays=dateDemandSummary(rows,source);
 const availableMonths=[...new Set(demandDays.map(day=>monthKeyOf(day.date)))].sort();
 const activeMonth=validMonth(q.month)?q.month!:availableMonths.includes(monthKeyOf(to))?monthKeyOf(to):availableMonths.at(-1)??monthKeyOf(to);
 const activeMonthBounds=monthBounds(activeMonth);
 const activeMonthDays=demandDays.filter(day=>monthKeyOf(day.date)===activeMonth);
 const requestedDate=validDate(q.date)?q.date:null;
 const selectedDate=requestedDate&&monthKeyOf(requestedDate)===activeMonth?requestedDate:activeMonthDays[0]?.date??null;
 const selectedDateDetails=selectedDate?activeMonthDays.find(day=>day.date===selectedDate)??null:null;
 const totalDateDemand=activeMonthDays.reduce((sum,day)=>sum+day.count,0);
 const busiestDay=activeMonthDays.reduce<DateDemandDay|null>((top,day)=>!top||day.count>top.count?day:top,null);
 const previousMonth=shiftMonth(activeMonth,-1);
 const nextMonth=shiftMonth(activeMonth,1);
 const canGoPrevious=previousMonth>=monthKeyOf(from);
 const canGoNext=nextMonth<=monthKeyOf(to);
 const funnelHref=(extra:Record<string,string|null|undefined>={})=>{
  const query=new URLSearchParams();
  query.set("from",from);
  query.set("to",to);
  query.set("source",source);
  const merged={month:activeMonth,date:selectedDate,...extra};
  for(const [key,value] of Object.entries(merged))if(value)query.set(key,value);
  return `/app/${businessSlug}/marketing/funnel?${query.toString()}`;
 };
 const topInventoryRows=Array.from(rows.reduce((map,row)=>{
  if(!row.inventory_item_id)return map;
  const existing=map.get(row.inventory_item_id)??{id:row.inventory_item_id,name:inventoryNameOf(row)??"Rental item",clicks:0,dateSelections:0,bookingStarts:0,bookings:0,revenue:0};
  if(!existing.name||existing.name==="Rental item")existing.name=inventoryNameOf(row)??existing.name;
  if(isInventoryClick(row))existing.clicks++;
  else if(row.event_name==="availability_date_selected")existing.dateSelections++;
  else if(row.event_name==="booking_started")existing.bookingStarts++;
  else if(row.event_name==="booking_completed"){existing.bookings++;existing.revenue+=Number(row.booking_total_cents??0);}
  map.set(row.inventory_item_id,existing);
  return map;
 },new Map<string,{id:string;name:string;clicks:number;dateSelections:number;bookingStarts:number;bookings:number;revenue:number}>()).values()).filter(row=>row.clicks||row.dateSelections||row.bookingStarts||row.bookings||row.revenue).sort((a,b)=>b.clicks-a.clicks||b.dateSelections-a.dateSelections||b.bookingStarts-a.bookingStarts||b.bookings-a.bookings||b.revenue-a.revenue||a.name.localeCompare(b.name)).slice(0,8);

 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content marketing-page marketing-funnel-page">
  <header className="marketing-analytics-header"><div><span className="sv-kicker">Marketing</span><h1>Booking funnel</h1><p>See how visitors move from your website to a completed booking.</p>{business.name&&<small>{business.name}</small>}</div></header>
  <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`} aria-current="page">Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link></nav>
  <form className="workspace-panel marketing-filter-bar" method="get"><div className="marketing-filter-group"><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label><label>Traffic source<select name="source" defaultValue={source}><option value="all">All traffic</option><option value="google">Google Ads</option></select></label></div><div className="marketing-filter-actions"><div className="marketing-quick-ranges">{quickRanges.map(range=><Link key={range.label} href={`/app/${businessSlug}/marketing/funnel?from=${range.from}&to=${range.to}&source=${source}`}>{range.label}</Link>)}</div><button className="sv-button">Update report</button></div></form>
  {error?<div className="workspace-notice error">Apply the booking funnel attribution migration to view this report.</div>:<>
   <section className="marketing-kpi-grid" aria-label="Booking funnel summary">
    <article className="workspace-panel"><span>Landing visits</span><strong>{counts.landing_page_view}</strong><small>Website sessions</small></article>
    <article className="workspace-panel"><span>Availability checks</span><strong>{counts.check_availability_clicked}</strong><small>{displayRate(counts.check_availability_clicked,counts.landing_page_view)} of visitors</small></article>
    <article className="workspace-panel"><span>Booking starts</span><strong>{counts.booking_started}</strong><small>{displayRate(counts.booking_started,counts.landing_page_view)} of visitors</small></article>
    <article className="workspace-panel"><span>Completed bookings</span><strong>{counts.booking_completed}</strong><small>{displayRate(counts.booking_completed,counts.landing_page_view)} conversion</small></article>
    <article className="workspace-panel"><span>Attributed revenue</span><strong>{money(revenue)}</strong><small>From completed bookings</small></article>
   </section>
   <section className="workspace-panel marketing-journey-panel"><header><div><h2>Booking journey</h2><p>See where customers continue and where they leave.</p></div></header><ol className="marketing-journey">{stages.map((stage,index)=>{const previous=index?counts[stages[index-1]]:0;const continued=index?displayRate(counts[stage],previous):"Starting point";const inactive=counts[stage]===0;return <li className={inactive?"is-inactive":""} key={stage}><article><span>{journeyShort[stage]}</span><strong>{counts[stage]}</strong><small>{index===0?"Website sessions":`${continued} continued`}</small></article>{index<stages.length-1&&<div className="marketing-journey-connector" aria-hidden="true"><b>→</b><small>{displayRate(counts[stages[index+1]],counts[stage])} continued</small></div>}</li>;})}</ol></section>
   {(noActivity||noBookings)&&<section className="workspace-panel marketing-empty-state"><strong>{noActivity?"No funnel activity for this date range":"No completed bookings yet"}</strong><p>{noActivity?"Try expanding the date range or changing the traffic-source filter.":"When customers complete bookings, conversion and revenue data will appear here."}</p></section>}
   <section className="marketing-secondary-grid">
    <article className="workspace-panel"><h2>Biggest drop-off</h2>{biggestDrop?<><strong>{journeyShort[biggestDrop.from]} → {journeyShort[biggestDrop.to]}</strong><b>{biggestDrop.dropRate}% drop</b><p>{biggestDrop.drop===1?`1 customer reached ${journeyShort[biggestDrop.from].toLowerCase()}, but none continued to ${journeyShort[biggestDrop.to].toLowerCase()}.`:`${biggestDrop.drop} customers reached ${journeyShort[biggestDrop.from].toLowerCase()}, but fewer continued to ${journeyShort[biggestDrop.to].toLowerCase()}.`}</p></>:<><strong>Not enough data yet</strong><p>More activity is needed before Servonas can identify a meaningful drop-off.</p></>}</article>
    <article className="workspace-panel"><h2>Conversion overview</h2><dl className="marketing-conversion-list"><div><dt>Visitor → Availability</dt><dd>{displayRate(counts.check_availability_clicked,counts.landing_page_view)}</dd></div><div><dt>Availability → Booking Started</dt><dd>{displayRate(counts.booking_started,counts.check_availability_clicked)}</dd></div><div><dt>Booking Started → Completed</dt><dd>{displayRate(counts.booking_completed,counts.booking_started)}</dd></div><div><dt>Visitor → Completed</dt><dd>{displayRate(counts.booking_completed,counts.landing_page_view)}</dd></div><div><dt>Average completed booking</dt><dd>{completedBookings?money(avgCompletedBooking):"—"}</dd></div></dl></article>
   </section>
   {activeMonthDays.length>0&&<section className="workspace-panel marketing-date-demand-panel"><header><div><h2>Requested rental dates</h2><p>Counts below show the date customers were trying to book for, not the day they clicked.</p></div><div className="marketing-date-demand-summary"><span>{monthTitle(activeMonth)}</span><strong>{totalDateDemand}</strong><small>{busiestDay?`Busiest date: ${new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${busiestDay.date}T12:00:00Z`))} · ${busiestDay.count} click${busiestDay.count===1?"":"s"}`:"No date clicks yet"}</small></div></header><div className="marketing-date-demand-layout"><section className="marketing-demand-calendar" aria-label={`Rental date demand for ${monthTitle(activeMonth)}`}><div className="marketing-demand-calendar-toolbar"><div className="marketing-demand-calendar-head"><Link href={funnelHref({month:previousMonth,date:null})} aria-disabled={!canGoPrevious} tabIndex={canGoPrevious?undefined:-1} className={!canGoPrevious?"is-disabled":""}>‹</Link><div><strong>{monthTitle(activeMonth)}</strong><small>{activeMonthDays.length} day{activeMonthDays.length===1?"":"s"} with demand</small></div><Link href={funnelHref({month:nextMonth,date:null})} aria-disabled={!canGoNext} tabIndex={canGoNext?undefined:-1} className={!canGoNext?"is-disabled":""}>›</Link></div><div className="marketing-demand-month-picker"><span>Jump to month</span><div>{availableMonths.map(month=><Link key={month} href={funnelHref({month,date:null})} className={month===activeMonth?"is-active":""} aria-current={month===activeMonth?"page":undefined}>{monthShortTitle(month)}</Link>)}</div></div></div><div className="marketing-demand-weekdays" aria-hidden="true">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><span key={day}>{day}</span>)}</div><div className="marketing-demand-grid">{[...Array(activeMonthBounds.firstWeekday).fill(null),...Array.from({length:activeMonthBounds.daysInMonth},(_,index)=>index+1)].map((day,index)=>{if(!day)return <span className="marketing-demand-day empty" key={`blank-${index}`}/>;const date=`${activeMonth}-${String(day).padStart(2,"0")}`,entry=activeMonthDays.find(item=>item.date===date)??null,isSelected=selectedDate===date,tone=entry?entry.count>=8?"is-hot":entry.count>=4?"is-warm":"is-cool":"is-empty";return <Link key={date} href={funnelHref({date})} className={`marketing-demand-day ${tone}${isSelected?" is-selected":""}`} aria-current={isSelected?"date":undefined}><b>{day}</b><strong>{entry?.count??0}</strong><small>{entry?.count===1?"click":"clicks"}</small></Link>;})}</div></section><aside className="marketing-demand-inspector">{selectedDateDetails?<><span className="sv-kicker">Selected date</span><h3>{new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${selectedDateDetails.date}T12:00:00Z`))}</h3><strong>{selectedDateDetails.count} rental-date click{selectedDateDetails.count===1?"":"s"}</strong><p>{selectedDateDetails.uniqueItems===1?"All clicks were focused on one rental item.":`${selectedDateDetails.uniqueItems} different rental items were involved for this date.`}</p><div className="marketing-demand-item-list">{selectedDateDetails.topItems.map(item=><div key={`${selectedDateDetails.date}-${item.itemId??item.itemName}`}><span>{item.itemName}</span><b>{item.count}</b></div>)}</div></>:<><span className="sv-kicker">Selected date</span><h3>No demand selected</h3><p>Click a day on the calendar to see which rental dates customers are trying to book.</p></>}</aside></div></section>}
   {topInventoryRows.length>0&&<section className="workspace-panel marketing-sources-panel"><header><div><h2>Most-clicked rental items</h2><p>See which rentals visitors are trying to book from your website.</p></div></header><div className="marketing-item-demand-table"><div><b>Rental item</b><b>Clicks</b><b>Date picks</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b></div>{topInventoryRows.map(row=><div key={row.id}><span>{row.name}</span><span>{row.clicks}</span><span>{row.dateSelections}</span><span>{row.bookingStarts}</span><span>{row.bookings}</span><span>{money(row.revenue)}</span></div>)}</div></section>}
   {sourceRows.length>1&&<section className="workspace-panel marketing-sources-panel"><header><div><h2>Traffic sources</h2><p>Source performance based on the attribution already captured by Servonas.</p></div></header><div className="marketing-sources-table"><div><b>Source</b><b>Visits</b><b>Availability</b><b>Bookings</b><b>Revenue</b></div>{sourceRows.map(row=><div key={row.name}><span>{row.name}</span><span>{row.visits}</span><span>{row.availability}</span><span>{row.bookings}</span><span>{money(row.revenue)}</span></div>)}</div></section>}
   <details className="workspace-panel marketing-attribution-note"><summary>How attribution works</summary><p>Google Ads attribution: A session is considered Google Ads-attributed when Servonas captures a Google click identifier or recognized Google Ads UTM attribution. These represent Servonas-attributed sessions, not imported Google Ads click totals.</p></details>
  </>}
 </section></main>;
}
