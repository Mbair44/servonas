import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import TerritoryManager, { type TerritoryHistoryEvent, type TerritoryManagerRecord, type TerritoryStatistics } from "@/components/TerritoryManager";
import type { TerritoryHeatPoint, TerritoryOverlayPoint, TerritoryOverlayRoute } from "@/lib/territoryOverlays";
import {territoryContainsLocation} from "@/lib/territoryStatistics";
import { assignTerritoryEmployee, createTerritory, endTerritoryEmployeeAssignment, setTerritoryActive, updateTerritory } from "./actions";

export default async function TerritoriesPage({
  params, searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const canViewPrivateHomes=canManageBusiness(role);
  const eightWeeksAgo=new Date(Date.now()-56*86400000).toISOString();
  const [{data:territories,error},{data:employees},{data:assignments},{data:locations},{data:jobs},{data:recurring},{data:office},{data:homes},{data:routePlan},{data:invoices},{data:metricFacts},{data:recentJobs},{data:territoryHistory},{data:assignmentHistory,error:historyError}]=await Promise.all([
    supabase.from("workforce_territories")
      .select("id,name,description,territory_type,postal_codes,neighborhoods,boundary_geojson,is_active,color,notes,parent_territory_id,strategy_config,version,updated_at")
      .eq("business_id", business.id).order("is_active", { ascending: false }).order("name"),
    supabase.from("employees").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).order("preferred_name"),
    supabase.from("employee_territory_assignments")
      .select("id,territory_id,employee_id,assignment_type,effective_from,effective_through,notes,employees!employee_territories_employee_fk(id,preferred_name)")
      .eq("business_id",business.id).is("ended_at",null).order("assignment_type"),
    supabase.from("service_locations")
      .select("id,customer_id,location_name,city,postal_code,latitude,longitude,customers!service_locations_customer_tenant_fk(first_name,last_name,company_name,tags,is_active)")
      .eq("business_id",business.id).eq("is_active",true).eq("is_deleted",false).not("latitude","is",null).not("longitude","is",null).limit(5000),
    supabase.from("jobs").select("id,title,status,starts_at,service_location_id")
      .eq("business_id",business.id).eq("is_deleted",false).not("service_location_id","is",null)
      .not("status","in",'("completed","cancelled")').limit(5000),
    supabase.from("recurring_service_series").select("service_location_id")
      .eq("business_id",business.id).eq("is_active",true).limit(5000),
    supabase.from("business_route_endpoint_defaults").select("office_label,office_latitude,office_longitude")
      .eq("business_id",business.id).maybeSingle(),
    canViewPrivateHomes
      ? supabase.from("technician_route_endpoint_overrides").select("technician_id,home_label,home_latitude,home_longitude").eq("business_id",business.id).not("home_latitude","is",null).not("home_longitude","is",null)
      : Promise.resolve({data:[]}),
    supabase.from("route_plans").select("id").eq("business_id",business.id).eq("calculation_status","ready").order("service_date",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("invoices").select("id,service_location_id,grand_total_cents,status").eq("business_id",business.id).eq("is_deleted",false).not("service_location_id","is",null).limit(10000),
    supabase.from("workforce_metric_facts")
      .select("id,metric_type,count_value,duration_seconds,distance_meters,jobs!workforce_metric_job_fk(service_location_id)")
      .eq("business_id",business.id).in("metric_type",["callback","drive_time_actual","drive_time_estimated"]).limit(10000),
    supabase.from("jobs").select("id,service_location_id,starts_at").eq("business_id",business.id).eq("is_deleted",false)
      .not("service_location_id","is",null).gte("starts_at",eightWeeksAgo).limit(10000),
    supabase.from("territory_audit_events").select("id,territory_id,event_type,territory_version,occurred_at,actor_user_id")
      .eq("business_id",business.id).order("occurred_at",{ascending:false}).limit(1000),
    supabase.from("territory_assignment_audit_events").select("id,territory_id,employee_id,event_type,assignment_type,occurred_at,actor_user_id")
      .eq("business_id",business.id).order("occurred_at",{ascending:false}).limit(1000),
  ]);
  const {data:routes}=routePlan?.id
    ? await supabase.from("technician_routes").select("id,encoded_polyline").eq("business_id",business.id).eq("route_plan_id",routePlan.id).eq("calculation_status","ready").not("encoded_polyline","is",null)
    : {data:[]};
  const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;
  const recurringLocations=new Set((recurring??[]).map(item=>item.service_location_id));
  const jobsByLocation=new Map<string,typeof jobs>();
  for(const job of jobs??[])jobsByLocation.set(job.service_location_id,[...(jobsByLocation.get(job.service_location_id)??[]),job]);
  const overlayPoints:TerritoryOverlayPoint[]=[];
  const heatPoints:TerritoryHeatPoint[]=[];
  const locationCoordinates=new Map<string,{latitude:number;longitude:number;label:string}>();
  for(const location of locations??[]){
    const customer=relation(location.customers),latitude=Number(location.latitude),longitude=Number(location.longitude);
    const name=customer?.company_name||[customer?.first_name,customer?.last_name].filter(Boolean).join(" ")||location.location_name;
    const isProspect=(customer?.tags??[]).some((tag:string)=>tag.toLowerCase()==="prospect");
    locationCoordinates.set(location.id,{latitude,longitude,label:name});
    overlayPoints.push({id:`customer-${location.id}`,layer:isProspect?"prospects":"customers",latitude,longitude,label:name,detail:location.location_name});
    heatPoints.push({id:`customer-${location.id}`,layer:"customer_density",latitude,longitude,weight:1,label:name});
    if(isProspect)heatPoints.push({id:`growth-${location.id}`,layer:"growth_opportunities",latitude,longitude,weight:1,label:name});
    if(recurringLocations.has(location.id))overlayPoints.push({id:`recurring-${location.id}`,layer:"recurring_customers",latitude,longitude,label:name,detail:"Recurring customer"});
    const locationJobs=jobsByLocation.get(location.id)??[];
    if(locationJobs.length)heatPoints.push({id:`jobs-${location.id}`,layer:"job_density",latitude,longitude,weight:locationJobs.length,label:name});
    for(const job of locationJobs)overlayPoints.push({id:`job-${job.id}`,layer:job.starts_at?"scheduled_appointments":"active_jobs",latitude,longitude,label:job.title,detail:job.starts_at?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:business.timezone}).format(new Date(job.starts_at)):job.status});
  }
  const revenueByLocation=new Map<string,number>();
  for(const invoice of invoices??[])if(invoice.service_location_id&&invoice.status!=="void"&&recurringLocations.has(invoice.service_location_id))revenueByLocation.set(invoice.service_location_id,(revenueByLocation.get(invoice.service_location_id)??0)+Number(invoice.grand_total_cents));
  for(const [locationId,weight] of revenueByLocation){const point=locationCoordinates.get(locationId);if(point&&weight>0)heatPoints.push({id:`revenue-${locationId}`,layer:"recurring_revenue",...point,weight,label:point.label});}
  const factWeights=new Map<string,{callback:number;drive:number}>();
  for(const fact of metricFacts??[]){const factJob=relation(fact.jobs),locationId=factJob?.service_location_id;if(!locationId)continue;const current=factWeights.get(locationId)??{callback:0,drive:0};if(fact.metric_type==="callback")current.callback+=Math.abs(fact.count_value??1);else current.drive+=fact.duration_seconds??0;factWeights.set(locationId,current);}
  for(const [locationId,weights] of factWeights){const point=locationCoordinates.get(locationId);if(!point)continue;if(weights.callback)heatPoints.push({id:`callbacks-${locationId}`,layer:"callback_density",...point,weight:weights.callback,label:point.label});if(weights.drive)heatPoints.push({id:`drive-${locationId}`,layer:"drive_time_density",...point,weight:weights.drive,label:point.label});}
  if(office?.office_latitude!=null&&office.office_longitude!=null)overlayPoints.push({id:"office",layer:"offices",latitude:Number(office.office_latitude),longitude:Number(office.office_longitude),label:office.office_label});
  for(const home of homes??[])overlayPoints.push({id:`home-${home.technician_id}`,layer:"technician_homes",latitude:Number(home.home_latitude),longitude:Number(home.home_longitude),label:home.home_label,detail:"Private technician endpoint"});
  const overlayRoutes:TerritoryOverlayRoute[]=(routes??[]).map(route=>({id:route.id,encodedPolyline:route.encoded_polyline!}));
  const territoryStatistics:TerritoryStatistics[]=(territories??[]).map(territory=>{
    const matching=(locations??[]).filter(location=>territoryContainsLocation(territory,{
      latitude:Number(location.latitude),longitude:Number(location.longitude),postalCode:location.postal_code,
      city:location.city,neighborhood:location.location_name,
    }));
    const locationIds=new Set(matching.map(location=>location.id));
    const customerCount=new Set(matching.map(location=>location.customer_id)).size;
    const recurringCustomers=new Set(matching.filter(location=>recurringLocations.has(location.id)).map(location=>location.customer_id)).size;
    const revenueCents=(invoices??[]).filter(invoice=>invoice.service_location_id&&locationIds.has(invoice.service_location_id)&&invoice.status!=="void").reduce((sum,invoice)=>sum+Number(invoice.grand_total_cents),0);
    const territoryJobs=(recentJobs??[]).filter(job=>job.service_location_id&&locationIds.has(job.service_location_id));
    const recentCutoff=Date.now()-28*86400000,priorCutoff=Date.now()-56*86400000;
    const currentJobs=territoryJobs.filter(job=>job.starts_at&&new Date(job.starts_at).getTime()>=recentCutoff).length;
    const priorJobs=territoryJobs.filter(job=>job.starts_at&&new Date(job.starts_at).getTime()>=priorCutoff&&new Date(job.starts_at).getTime()<recentCutoff).length;
    const facts=(metricFacts??[]).filter(fact=>{const job=relation(fact.jobs);return job?.service_location_id&&locationIds.has(job.service_location_id);});
    const driveFacts=facts.filter(fact=>fact.metric_type==="drive_time_actual"||fact.metric_type==="drive_time_estimated");
    const driveSeconds=driveFacts.reduce((sum,fact)=>sum+(fact.duration_seconds??0),0);
    const driveMeters=driveFacts.reduce((sum,fact)=>sum+(fact.distance_meters??0),0);
    return {territoryId:territory.id,customerCount,recurringCustomers,revenueCents,jobsPerWeek:Number((territoryJobs.length/8).toFixed(1)),
      averageDriveSeconds:driveFacts.length?Math.round(driveSeconds/driveFacts.length):null,
      weeklyMileage:driveMeters?Number((driveMeters/1609.344/8).toFixed(1)):null,
      assignedTechnicians:(assignments??[]).filter(item=>item.territory_id===territory.id).length,
      growthPercent:priorJobs?Math.round((currentJobs-priorJobs)/priorJobs*100):null};
  });
  const employeeNames=new Map((employees??[]).map(employee=>[employee.id,employee.preferred_name]));
  const history:TerritoryHistoryEvent[]=[
    ...(territoryHistory??[]).map(event=>({id:event.id,territoryId:event.territory_id,eventType:event.event_type,occurredAt:event.occurred_at,detail:`Territory version ${event.territory_version}`})),
    ...(assignmentHistory??[]).map(event=>({id:event.id,territoryId:event.territory_id,eventType:event.event_type,occurredAt:event.occurred_at,detail:`${employeeNames.get(event.employee_id)??"Employee"} · ${event.assignment_type}`})),
  ].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
  if(historyError)console.error("Territory assignment history load failed",{businessId:business.id,code:historyError.code});
  if (error) {
    console.error("Territory manager load failed", { businessId: business.id, code: error.code });
  }
  return <main className="epic3-shell territory-shell">
    <WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/>
    <section className="epic3-content territory-content">
      {query.success && <div className="workspace-notice success">{query.success}</div>}
      {query.error && <div className="workspace-notice error">{query.error}</div>}
      {error
        ? <div className="workspace-notice error">Territories could not be loaded. Confirm the Epic 8.5 Checkpoint 1 migration is installed.</div>
        : <TerritoryManager
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
            businessName={business.name}
            scenarioHref={`/app/${businessSlug}/territories/scenarios`}
            territories={(territories ?? []) as TerritoryManagerRecord[]}
            employees={employees??[]}
            assignments={assignments??[]}
            overlayPoints={overlayPoints}
            overlayRoutes={overlayRoutes}
            heatPoints={heatPoints}
            territoryStatistics={territoryStatistics}
            history={history}
            historyAvailable={!historyError}
            canViewPrivateHomes={canViewPrivateHomes}
            canEdit={canManageBusiness(role)}
            createAction={createTerritory.bind(null, businessSlug)}
            updateAction={updateTerritory.bind(null, businessSlug)}
            statusAction={setTerritoryActive.bind(null, businessSlug)}
            assignAction={assignTerritoryEmployee.bind(null,businessSlug)}
            endAssignmentAction={endTerritoryEmployeeAssignment.bind(null,businessSlug)}
          />}
    </section>
  </main>;
}
