import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import TerritoryManager, { type TerritoryManagerRecord } from "@/components/TerritoryManager";
import type { TerritoryOverlayPoint, TerritoryOverlayRoute } from "@/lib/territoryOverlays";
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
  const [{data:territories,error},{data:employees},{data:assignments},{data:locations},{data:jobs},{data:recurring},{data:office},{data:homes},{data:routePlan}]=await Promise.all([
    supabase.from("workforce_territories")
      .select("id,name,description,territory_type,postal_codes,neighborhoods,boundary_geojson,is_active,color,notes,parent_territory_id,strategy_config,version,updated_at")
      .eq("business_id", business.id).order("is_active", { ascending: false }).order("name"),
    supabase.from("employees").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).order("preferred_name"),
    supabase.from("employee_territory_assignments")
      .select("id,territory_id,employee_id,assignment_type,effective_from,effective_through,notes,employees!employee_territories_employee_fk(id,preferred_name)")
      .eq("business_id",business.id).is("ended_at",null).order("assignment_type"),
    supabase.from("service_locations")
      .select("id,customer_id,location_name,latitude,longitude,customers!service_locations_customer_tenant_fk(first_name,last_name,company_name,tags,is_active)")
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
  ]);
  const {data:routes}=routePlan?.id
    ? await supabase.from("technician_routes").select("id,encoded_polyline").eq("business_id",business.id).eq("route_plan_id",routePlan.id).eq("calculation_status","ready").not("encoded_polyline","is",null)
    : {data:[]};
  const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;
  const recurringLocations=new Set((recurring??[]).map(item=>item.service_location_id));
  const jobsByLocation=new Map<string,typeof jobs>();
  for(const job of jobs??[])jobsByLocation.set(job.service_location_id,[...(jobsByLocation.get(job.service_location_id)??[]),job]);
  const overlayPoints:TerritoryOverlayPoint[]=[];
  for(const location of locations??[]){
    const customer=relation(location.customers),latitude=Number(location.latitude),longitude=Number(location.longitude);
    const name=customer?.company_name||[customer?.first_name,customer?.last_name].filter(Boolean).join(" ")||location.location_name;
    const isProspect=(customer?.tags??[]).some((tag:string)=>tag.toLowerCase()==="prospect");
    overlayPoints.push({id:`customer-${location.id}`,layer:isProspect?"prospects":"customers",latitude,longitude,label:name,detail:location.location_name});
    if(recurringLocations.has(location.id))overlayPoints.push({id:`recurring-${location.id}`,layer:"recurring_customers",latitude,longitude,label:name,detail:"Recurring customer"});
    for(const job of jobsByLocation.get(location.id)??[])overlayPoints.push({
      id:`job-${job.id}`,layer:job.starts_at?"scheduled_appointments":"active_jobs",latitude,longitude,
      label:job.title,detail:job.starts_at?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:business.timezone}).format(new Date(job.starts_at)):job.status,
    });
  }
  if(office?.office_latitude!=null&&office.office_longitude!=null)overlayPoints.push({id:"office",layer:"offices",latitude:Number(office.office_latitude),longitude:Number(office.office_longitude),label:office.office_label});
  for(const home of homes??[])overlayPoints.push({id:`home-${home.technician_id}`,layer:"technician_homes",latitude:Number(home.home_latitude),longitude:Number(home.home_longitude),label:home.home_label,detail:"Private technician endpoint"});
  const overlayRoutes:TerritoryOverlayRoute[]=(routes??[]).map(route=>({id:route.id,encodedPolyline:route.encoded_polyline!}));
  if (error) {
    console.error("Territory manager load failed", { businessId: business.id, code: error.code });
  }
  return <main className="epic3-shell territory-shell">
    <WorkspaceNav slug={businessSlug} name={business.name}/>
    <section className="epic3-content territory-content">
      {query.success && <div className="workspace-notice success">{query.success}</div>}
      {query.error && <div className="workspace-notice error">{query.error}</div>}
      {error
        ? <div className="workspace-notice error">Territories could not be loaded. Confirm the Epic 8.5 Checkpoint 1 migration is installed.</div>
        : <TerritoryManager
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
            businessName={business.name}
            territories={(territories ?? []) as TerritoryManagerRecord[]}
            employees={employees??[]}
            assignments={assignments??[]}
            overlayPoints={overlayPoints}
            overlayRoutes={overlayRoutes}
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
