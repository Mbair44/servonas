import Link from "next/link";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../WorkspaceNav";
import {summarizeScenario} from "@/lib/territoryScenarios";
import {simulateTerritories,type SimulationLocation} from "@/lib/territorySimulation";
import {createScenario,deleteScenario,duplicateScenario,renameScenario,setScenarioStatus,setScenarioTerritoryRemoved,updateScenarioTerritory} from "./actions";
const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;
export default async function ScenarioPlannerPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{scenario?:string;success?:string;error?:string}>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageBusiness(role);
 const [{data:scenarios,error},{data:liveTerritories}]=await Promise.all([
  supabase.from("territory_scenarios").select("id,name,description,status,version,source_scenario_id,simulation_status,simulation_revision,created_at,updated_at,archived_at").eq("business_id",business.id).is("deleted_at",null).order("updated_at",{ascending:false}),
  supabase.from("workforce_territories").select("id,territory_type,postal_codes,neighborhoods,boundary_geojson,strategy_config").eq("business_id",business.id).eq("is_active",true),
 ]);
 const selected=(scenarios??[]).find(item=>item.id===(q.scenario??scenarios?.[0]?.id));
 const eightWeeksAgo=new Date(Date.now()-56*86400000).toISOString();
 const [{data:scenarioTerritories},{data:locations},{data:recurring},{data:invoices},{data:jobs},{data:metricFacts}]=selected?await Promise.all([
  supabase.from("territory_scenario_territories").select("id,name,color,territory_type,postal_codes,neighborhoods,boundary_geojson,strategy_config,change_type,source_territory_id,version").eq("business_id",business.id).eq("scenario_id",selected.id).order("name"),
  supabase.from("service_locations").select("id,customer_id,location_name,city,postal_code,latitude,longitude").eq("business_id",business.id).eq("is_active",true).eq("is_deleted",false).not("latitude","is",null).not("longitude","is",null).limit(5000),
  supabase.from("recurring_service_series").select("service_location_id").eq("business_id",business.id).eq("is_active",true).limit(5000),
  supabase.from("invoices").select("service_location_id,grand_total_cents,status").eq("business_id",business.id).eq("is_deleted",false).not("service_location_id","is",null).limit(10000),
  supabase.from("jobs").select("service_location_id,starts_at").eq("business_id",business.id).eq("is_deleted",false).not("service_location_id","is",null).gte("starts_at",eightWeeksAgo).limit(10000),
  supabase.from("workforce_metric_facts").select("metric_type,duration_seconds,distance_meters,jobs!workforce_metric_job_fk(service_location_id)").eq("business_id",business.id).in("metric_type",["drive_time_actual","drive_time_estimated"]).limit(10000),
 ]):[{data:[]},{data:[]},{data:[]},{data:[]},{data:[]},{data:[]}];
 if(error)console.error("Territory scenarios load failed",{businessId:business.id,code:error.code});
 const recurringIds=new Set((recurring??[]).map(item=>item.service_location_id));
 const simulationLocations:SimulationLocation[]=(locations??[]).map(location=>{
  const locationInvoices=(invoices??[]).filter(invoice=>invoice.service_location_id===location.id&&invoice.status!=="void");
  const locationJobs=(jobs??[]).filter(job=>job.service_location_id===location.id);
  const driveFacts=(metricFacts??[]).filter(fact=>relation(fact.jobs)?.service_location_id===location.id);
  return {id:location.id,customerId:location.customer_id,latitude:Number(location.latitude),longitude:Number(location.longitude),
   postalCode:location.postal_code,city:location.city,neighborhood:location.location_name,
   recurringRevenueCents:recurringIds.has(location.id)?locationInvoices.reduce((sum,item)=>sum+Number(item.grand_total_cents),0):0,
   jobsPerWeek:locationJobs.length/8,weeklyDriveMeters:driveFacts.reduce((sum,item)=>sum+(item.distance_meters??0),0)/8,
   weeklyDriveSeconds:driveFacts.reduce((sum,item)=>sum+(item.duration_seconds??0),0)/8};
 });
 const proposed=(scenarioTerritories??[]).filter(item=>item.change_type!=="removed").map(item=>({...item,id:item.source_territory_id??item.id}));
 const simulation=simulateTerritories(liveTerritories??[],proposed,simulationLocations);
 const comparison=summarizeScenario(liveTerritories?.length??0,scenarioTerritories??[]);
 const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content scenario-planner">
  <header className="scenario-header"><div><span className="sv-kicker">Territory intelligence</span><h1>Scenario planner</h1><p>Explore operating changes without affecting live customers or territories.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/territories`}>Back to territories</Link></header>
  {q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}
  {error?<div className="workspace-notice error">{error.code==="42703"?"Apply the Epic 8.5 Checkpoint 11 live simulation migration.":"Scenario planning could not be loaded. Review the server logs."}</div>:<div className="scenario-workspace">
   <aside className="scenario-directory"><header><strong>Scenarios</strong><span>{scenarios?.length??0}</span></header>{canEdit&&<form action={createScenario.bind(null,businessSlug)}><input required name="name" maxLength={150} placeholder="Scenario name"/><textarea name="description" maxLength={2000} placeholder="What are you testing?"/><button className="sv-button">Create scenario</button></form>}<nav>{scenarios?.map(item=><Link key={item.id} className={selected?.id===item.id?"active":""} href={`?scenario=${item.id}`}><i className={item.status}/><span><strong>{item.name}</strong><small>{item.status} · {new Intl.DateTimeFormat("en-US",{dateStyle:"medium"}).format(new Date(item.updated_at))}</small></span></Link>)}</nav></aside>
   <section className="scenario-detail">{selected?<><header><div><span>{selected.status} scenario · simulation revision {selected.simulation_revision}</span><h2>{selected.name}</h2><p>{selected.description||"No planning notes yet."}</p></div><strong>Version {selected.version}</strong></header>
    <div className="scenario-comparison"><article><span>Current</span><strong>{comparison.liveCount}</strong><small>active territories</small></article><b>→</b><article><span>Proposed</span><strong>{comparison.proposedCount}</strong><small>scenario territories</small></article><article><span>Changes</span><strong>{comparison.changedCount}</strong><small>proposed modifications</small></article></div>
    <section className="scenario-simulation"><header><div><span className="sv-kicker">Live simulation</span><h3>Operational impact</h3></div><small>Recalculated from current measured facts</small></header><div>
     <article><strong>{simulation.customersAffected}</strong><span>Customers affected</span></article><article><strong>{simulation.coverageGaps}</strong><span>Coverage gaps</span></article>
     <article><strong>{simulation.customerCount}</strong><span>Customers covered</span></article><article><strong>{money.format(simulation.recurringRevenueCents/100)}</strong><span>Recurring revenue covered</span></article>
     <article><strong>{simulation.jobsPerWeek}</strong><span>Jobs per week</span></article><article><strong>{simulation.routeDensity??"—"}</strong><span>Jobs per territory</span></article>
     <article><strong>{(simulation.weeklyDriveMeters/1609.344).toFixed(1)} mi</strong><span>Measured weekly drive</span></article><article><strong>{Math.round(simulation.weeklyDriveSeconds/60)} min</strong><span>Measured weekly drive time</span></article>
    </div><footer>Technician utilization, fuel usage, and labor savings require authoritative capacity, vehicle-efficiency, and recalculated-route inputs. No estimate is fabricated.</footer></section>
    <div className="scenario-territory-list">{scenarioTerritories?.length?scenarioTerritories.map(item=><article className={item.change_type==="removed"?"removed":""} key={item.id}><i style={{background:item.color}}/><div><strong>{item.name}</strong><span>{item.territory_type.replaceAll("_"," ")}</span></div><b className={item.change_type}>{item.change_type}</b>{canEdit&&selected.status==="draft"&&<details><summary>Edit simulation input</summary><form action={updateScenarioTerritory.bind(null,businessSlug)}><input type="hidden" name="scenarioId" value={selected.id}/><input type="hidden" name="scenarioTerritoryId" value={item.id}/><input type="hidden" name="version" value={item.version}/><input type="hidden" name="strategyConfig" value={JSON.stringify(item.strategy_config??{})}/><label>Name<input required name="name" defaultValue={item.name}/></label><label>ZIP codes<input name="postalCodes" defaultValue={item.postal_codes.join(", ")}/></label><label>Neighborhoods<input name="neighborhoods" defaultValue={item.neighborhoods.join(", ")}/></label><label>Cities<input name="cities" defaultValue={(item.strategy_config?.cities??[]).join(", ")}/></label><label className="wide">Boundary GeoJSON<textarea name="boundaryGeojson" defaultValue={item.boundary_geojson?JSON.stringify(item.boundary_geojson):""}/></label><button className="sv-button sv-secondary">Save and recalculate</button></form><form action={setScenarioTerritoryRemoved.bind(null,businessSlug)}><input type="hidden" name="scenarioId" value={selected.id}/><input type="hidden" name="scenarioTerritoryId" value={item.id}/><input type="hidden" name="removed" value={String(item.change_type!=="removed")}/><button className="scenario-delete">{item.change_type==="removed"?"Restore territory":"Remove from scenario"}</button></form></details>}</article>):<p>No territories were present when this scenario was created.</p>}</div>
    {canEdit&&<section className="scenario-actions"><form action={renameScenario.bind(null,businessSlug)}><input type="hidden" name="scenarioId" value={selected.id}/><input type="hidden" name="version" value={selected.version}/><label>Name<input required name="name" defaultValue={selected.name} maxLength={150}/></label><label>Planning notes<textarea name="description" defaultValue={selected.description??""} maxLength={2000}/></label><button className="sv-button sv-secondary">Save details</button></form><form action={duplicateScenario.bind(null,businessSlug)}><input type="hidden" name="scenarioId" value={selected.id}/><input required name="name" defaultValue={`${selected.name} copy`} maxLength={150}/><button className="sv-button sv-secondary">Duplicate</button></form><form action={setScenarioStatus.bind(null,businessSlug)}><input type="hidden" name="scenarioId" value={selected.id}/><input type="hidden" name="status" value={selected.status==="archived"?"draft":"archived"}/><button className="sv-button sv-secondary">{selected.status==="archived"?"Restore":"Archive"}</button></form>{selected.status==="archived"&&<form action={deleteScenario.bind(null,businessSlug)}><input type="hidden" name="scenarioId" value={selected.id}/><button className="scenario-delete">Delete archived scenario</button></form>}</section>}
   </>:<div className="scenario-empty"><strong>No scenario selected</strong><p>Create a scenario to snapshot the current territory plan safely.</p></div>}</section>
  </div>}
 </section></main>;
}
