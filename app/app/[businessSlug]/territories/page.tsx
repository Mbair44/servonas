import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import TerritoryManager, { type TerritoryManagerRecord } from "@/components/TerritoryManager";
import { createTerritory, setTerritoryActive, updateTerritory } from "./actions";

export default async function TerritoriesPage({
  params, searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const { data: territories, error } = await supabase.from("workforce_territories")
    .select("id,name,description,territory_type,postal_codes,neighborhoods,boundary_geojson,is_active,color,notes,parent_territory_id,strategy_config,version,updated_at")
    .eq("business_id", business.id).order("is_active", { ascending: false }).order("name");
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
            canEdit={canManageBusiness(role)}
            createAction={createTerritory.bind(null, businessSlug)}
            updateAction={updateTerritory.bind(null, businessSlug)}
            statusAction={setTerritoryActive.bind(null, businessSlug)}
          />}
    </section>
  </main>;
}
