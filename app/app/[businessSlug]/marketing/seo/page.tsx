import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { buildLocalSeoReport, type LocalSeoLocationInput } from "@/lib/localSeo";
import {findLocationPage,normalizedLocationKey,locationOpportunityAction} from "@/lib/locationPageIdentity";
import {buildLocalGrowthPlan} from "@/lib/localSeoGrowth";
import {addLocalSeoLocation,buildLocationPage,saveLocalSeoDraft,selectSearchConsoleProperty,updateLocalSeoRecommendationState} from "./actions";
import {ensureSearchConsoleProperties,normalizeSearchConsoleUrl,propertyMatchesDomain,syncSearchConsole} from "@/lib/googleSearchConsole";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {LocationPageSubmit} from "@/components/LocationPageSubmit";

function baseUrl(publicSlug: string | null, customDomain: string | null) {
  if (customDomain) return `https://${customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return `${process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com"}/sites/${encodeURIComponent(publicSlug || "")}`;
}

function compactDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return null;
  }
}

function friendlyWebsiteName(value: string) {
  if (value.startsWith("sc-domain:")) return value.slice("sc-domain:".length).replace(/^www\./, "");
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""); }
}

function percentChange(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export default async function LocalSeoPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string; preview?: string; pendingLocation?:string; pendingZip?:string; focusCity?:string }>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can manage Local SEO.</div></section></main>;

  const [
    { data: website },
    { data: services },
    { data: inventory },
    { data: territories },
    { data: bookings },
    { data: serviceLocations },
    { data: seoStates },
    { data: seoMappings },
    { data: googleConnection },
    { data: locationPages },
    { data: googleAdsConnection },
    { data: googleAdGroups },
    { data: searchConsoleConnection },
  ] = await Promise.all([
    supabase.from("business_website_settings").select("public_slug,status,custom_domain,domain_status,hero_heading,hero_subheading,about_text,photo_urls,google_reviews").eq("business_id", business.id).maybeSingle(),
    supabase.from("services").select("id,name,description,price_amount,price_label,active").eq("business_id", business.id).eq("is_deleted", false).order("name"),
    supabase.from("inventory_items").select("id,name,description,daily_price_cents,image_url,active").eq("business_id", business.id).eq("active", true).order("name"),
    supabase.from("workforce_territories").select("id,name").eq("business_id", business.id).eq("is_active", true).order("name"),
    supabase.from("bookings").select("id,service_id,created_at,status,service_location_id").eq("business_id", business.id).gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()).in("status", ["confirmed", "paid"]),
    supabase.from("service_locations").select("id,city,state").eq("business_id", business.id).eq("is_deleted", false),
    supabase.from("business_local_seo_recommendation_states").select("dedupe_key,status,dismissed_at,completed_at,metadata").eq("business_id", business.id),
    supabase.from("business_seo_entity_mappings").select("source_entity_type,source_entity_id,target_type,status,metadata").eq("business_id", business.id),
    supabase.from("business_google_profile_connections").select("status,location_title,google_account_id,google_location_id").eq("business_id", business.id).maybeSingle(),
    supabase.from("business_location_pages").select("id,source_location_key,city,state,slug,status,page_title,meta_description,published_at,updated_at").eq("business_id",business.id).neq("status","archived"),
    supabase.from("business_google_ads_connections").select("status,google_ads_customer_id").eq("business_id",business.id).maybeSingle(),
    supabase.from("business_google_ads_ad_groups").select("destination_url,status").eq("business_id",business.id).neq("status","archived"),
    supabase.from("business_google_search_console_connections").select("status,property_url,available_properties,last_synced_at,last_error_message").eq("business_id",business.id).maybeSingle(),
  ]);
  // OAuth credentials are deliberately RLS-private; expose only safe status and aggregates through this authorized server page.
  const searchConsoleDb=getSupabaseAdmin();
  const searchConsoleResult=searchConsoleDb?await searchConsoleDb.from("business_google_search_console_connections").select("status,property_url,available_properties,last_synced_at,last_error_message").eq("business_id",business.id).maybeSingle():{data:null,error:{message:"Search Console storage is unavailable."}};
  let searchConsoleState=searchConsoleResult.data??searchConsoleConnection;
  if(searchConsoleState?.status==="property_selection_required"&&!Array.isArray(searchConsoleState.available_properties)){
    const discovery=await ensureSearchConsoleProperties(business.id);
    searchConsoleState={...searchConsoleState,available_properties:discovery.properties,status:discovery.status==="discovered"||discovery.status==="cached"?"property_selection_required":discovery.status==="empty"?"error":searchConsoleState.status,last_error_message:discovery.status==="empty"?"No Search Console properties found for this Google account.":searchConsoleState.last_error_message};
  }else if(searchConsoleState?.status==="property_selection_required"&&Array.isArray(searchConsoleState.available_properties)&&searchConsoleState.available_properties.length===0){
    const discovery=await ensureSearchConsoleProperties(business.id);
    searchConsoleState={...searchConsoleState,available_properties:discovery.properties,status:discovery.status==="discovered"||discovery.status==="cached"?"property_selection_required":discovery.status==="empty"?"error":searchConsoleState.status,last_error_message:discovery.status==="empty"?"No Search Console properties found for this Google account.":searchConsoleState.last_error_message};
  }
  if(searchConsoleState?.status==="connected"&&searchConsoleState.property_url)await syncSearchConsole({businessId:business.id});
  const {data:searchConsoleRows}=searchConsoleDb&&searchConsoleState?.property_url?await searchConsoleDb.from("business_google_search_console_rows").select("report_date,page_url,query,clicks,impressions,ctr,position,synced_at").eq("business_id",business.id).eq("property_url",searchConsoleState.property_url):{data:[]};

  const profileReviews={reviews:(Array.isArray(website?.google_reviews)?website.google_reviews:[]).filter((review:any)=>review&&typeof review.text==="string").map((review:any,index:number)=>({reviewId:String(review.reviewId??`saved-review-${index}`),author:String(review.author??"Google user"),rating:Number(review.rating??0),text:String(review.text),publishedAt:typeof review.publishedAt==="string"?review.publishedAt:null,reply:typeof review.reply==="string"?review.reply:null})),reviewCount:Array.isArray(website?.google_reviews)?website.google_reviews.length:0};
  const websiteBase = baseUrl(website?.public_slug ?? business.slug, website?.domain_status === "connected" ? website?.custom_domain ?? null : null);
  const reportDates=[...new Set((searchConsoleRows??[]).map((row:any)=>String(row.report_date)).filter(Boolean))].sort().reverse();
  const currentSearchRows=(searchConsoleRows??[]).filter((row:any)=>String(row.report_date)===reportDates[0]);
  const previousSearchRows=reportDates[1]?(searchConsoleRows??[]).filter((row:any)=>String(row.report_date)===reportDates[1]):[];
  const summarizeSearch=(rows:any[])=>rows.reduce((total,row)=>({clicks:total.clicks+Number(row.clicks??0),impressions:total.impressions+Number(row.impressions??0),positionWeighted:total.positionWeighted+Number(row.position??0)*Number(row.impressions??0)}),{clicks:0,impressions:0,positionWeighted:0});
  const currentSearchSummary=summarizeSearch(currentSearchRows),previousSearchSummary=summarizeSearch(previousSearchRows);
  const topSearches=[...currentSearchRows.reduce((entries,row:any)=>{const query=String(row.query??"").trim();if(!query)return entries;const current=entries.get(query)??{query,clicks:0,impressions:0,positionWeighted:0};current.clicks+=Number(row.clicks??0);current.impressions+=Number(row.impressions??0);current.positionWeighted+=Number(row.position??0)*Number(row.impressions??0);entries.set(query,current);return entries;},new Map<string,{query:string;clicks:number;impressions:number;positionWeighted:number}>()).values()].sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks).slice(0,8);
  const bookingCountsByService = new Map<string, number>();
  for (const row of bookings ?? []) {
    const serviceId = typeof row.service_id === "string" ? row.service_id : null;
    if (!serviceId) continue;
    bookingCountsByService.set(serviceId, (bookingCountsByService.get(serviceId) ?? 0) + 1);
  }

  const locationById = new Map((serviceLocations ?? []).map((row) => [row.id, row]));
  const locationCounts = new Map<string, { name: string; jobCount90d: number; customerIds: Set<string>; reviewCount: number }>();
  for (const row of serviceLocations ?? []) {
    const label = [row.city, row.state].filter(Boolean).join(", ");
    if (!label) continue;
    const current = locationCounts.get(label) ?? { name: label, jobCount90d: 0, customerIds: new Set<string>(), reviewCount: 0 };
    current.customerIds.add(row.id);
    locationCounts.set(label, current);
  }
  for (const row of bookings ?? []) {
    const location = row.service_location_id ? locationById.get(String(row.service_location_id)) : null;
    const label = location ? [location.city, location.state].filter(Boolean).join(", ") : "";
    if (!label) continue;
    const current = locationCounts.get(label) ?? { name: label, jobCount90d: 0, customerIds: new Set<string>(), reviewCount: 0 };
    current.jobCount90d += 1;
    locationCounts.set(label, current);
  }
  for (const review of profileReviews?.reviews ?? []) {
    const text = `${review.text} ${review.author}`.toLowerCase();
    for (const [label, current] of locationCounts.entries()) {
      const city = label.split(",")[0]?.trim().toLowerCase();
      if (city && text.includes(city)) current.reviewCount += 1;
    }
  }
  const locations: LocalSeoLocationInput[] = [...locationCounts.values()].map((entry) => ({
    id: entry.name,
    name: entry.name,
    jobCount90d: entry.jobCount90d,
    customerCount: entry.customerIds.size,
    reviewCount: entry.reviewCount,
  })).sort((left, right) => right.jobCount90d - left.jobCount90d || right.customerCount - left.customerCount || left.name.localeCompare(right.name));

  const serviceAreas = (territories ?? []).map((row) => row.name).filter(Boolean);
  const unansweredReviews = (profileReviews?.reviews ?? []).filter((review) => !review.reply);
  const allServices = [
    ...(services ?? []).map((service) => ({ id: service.id, name: service.name, description: service.description, price_amount: service.price_amount, price_label: service.price_label, bookingCount90d: bookingCountsByService.get(service.id) ?? 0, active: service.active })),
    ...(inventory ?? []).map((item) => ({ id: item.id, name: item.name, description: item.description, price_amount: item.daily_price_cents != null ? Number(item.daily_price_cents) / 100 : null, price_label: item.daily_price_cents != null ? `$${(Number(item.daily_price_cents) / 100).toFixed(0)} / day` : null, bookingCount90d: 0, imageUrl: item.image_url, active: item.active })),
  ];
  const reviewSnippets = unansweredReviews.slice(0, 3).map((review) => ({ author: review.author, text: review.text, locationLabel: locations.find((entry) => review.text.toLowerCase().includes(entry.name.split(",")[0]!.toLowerCase()))?.name ?? null }));
  const report = buildLocalSeoReport({
    businessName: business.name,
    phone: business.phone ?? null,
    websiteBasePath: websiteBase,
    serviceAreas,
    websiteStatus: website?.status === "published" ? "published" : website ? "draft" : "missing",
    googleBusinessConnected: googleConnection?.status === "connected",
    googleBusinessLocationTitle: googleConnection?.location_title ?? null,
    googleBusinessSupportsServices: googleConnection?.status === "connected",
    services: allServices,
    locations,
    unansweredReviews,
    mappings: (seoMappings ?? []) as any,
    states: (seoStates ?? []) as any,
    reviewSnippets,
  });

  const previewKey = query.preview ?? "";
  const previewRecommendation = report.recommendations.find((item) => item.dedupeKey === previewKey && item.draft);
  const visibleHigh=report.highPriority.filter(item=>item.type!=="missing_location_page"),visibleMedium=report.mediumPriority.filter(item=>item.type!=="missing_location_page");
  const locationRecommendationByKey=new Map(report.recommendations.filter(item=>item.type==="missing_location_page").map(item=>[item.entityId,item]));
  const locationCards=[...locations.map(location=>({location,page:findLocationPage(locationPages??[],location.id),recommendation:locationRecommendationByKey.get(location.id)??null})),...report.recommendations.filter(item=>item.type==="missing_location_page"&&!locations.some(location=>location.id.toLowerCase()===item.entityId.toLowerCase())).map(item=>({location:{id:item.entityId,name:item.entityLabel,jobCount90d:0,customerCount:0,reviewCount:0},page:findLocationPage(locationPages??[],item.entityId),recommendation:item})),...(locationPages??[]).filter(page=>!locations.some(location=>findLocationPage([page],location.id)!==null)&&!report.recommendations.some(item=>item.type==="missing_location_page"&&findLocationPage([page],item.entityId)!==null)).map(page=>({location:{id:page.source_location_key,name:[page.city,page.state].filter(Boolean).join(", "),jobCount90d:0,customerCount:0,reviewCount:0},page,recommendation:null}))].filter((card,index,cards)=>cards.findIndex(other=>normalizedLocationKey(other.location.id)===normalizedLocationKey(card.location.id))===index);
  report.highPriority=visibleHigh;report.mediumPriority=visibleMedium;
  const searchConsoleChoices=(searchConsoleState?.status==="property_selection_required"&&Array.isArray(searchConsoleState.available_properties)?searchConsoleState.available_properties:[]).map((entry:any)=>({value:String(entry.siteUrl),name:friendlyWebsiteName(String(entry.siteUrl)),recommended:propertyMatchesDomain(String(entry.siteUrl),websiteBase)}));
  const recommendedSearchConsoleProperty=searchConsoleChoices.find(choice=>choice.recommended);
  const hasSingleRecommendedSearchConsoleProperty=Boolean(recommendedSearchConsoleProperty)&&searchConsoleChoices.filter(choice=>choice.recommended).length===1;
  const publishedLocationCities=new Set((locationPages??[]).filter(page=>page.status==="published").map(page=>String(page.city??page.source_location_key).toLowerCase()));
  const searchDemandCity=serviceAreas.map(area=>String(area).split(",")[0]?.trim()??"").find(city=>city.length>2&&!publishedLocationCities.has(city.toLowerCase())&&topSearches.some(search=>search.impressions>=5&&search.query.toLowerCase().includes(city.toLowerCase())))??null;
  const lowClickLocation=(locationPages??[]).filter(page=>page.status==="published").map(page=>{const pageRows=currentSearchRows.filter((row:any)=>normalizeSearchConsoleUrl(String(row.page_url))===normalizeSearchConsoleUrl(`${websiteBase}/${page.slug}`));const totals=summarizeSearch(pageRows);return {page,totals};}).find(entry=>entry.totals.impressions>=20&&entry.totals.clicks===0)??null;
  const serviceSearchOpportunity=allServices.find(service=>service.name&&topSearches.some(search=>search.impressions>=10&&search.query.toLowerCase().includes(String(service.name).toLowerCase())))??null;
  if(searchConsoleState?.property_url&&currentSearchRows.length){const locationUrls=new Set((locationPages??[]).filter(page=>page.status==="published").map(page=>normalizeSearchConsoleUrl(`${websiteBase}/${page.slug}`)));console.info("google_search_console_reporting_loaded",{businessId:business.id,property:searchConsoleState.property_url,reportDate:reportDates[0]??null,rowsCached:currentSearchRows.length,locationPagesMatched:new Set(currentSearchRows.filter((row:any)=>locationUrls.has(normalizeSearchConsoleUrl(String(row.page_url)))).map((row:any)=>row.page_url)).size});}

  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page local-seo-page">
    <header className="marketing-analytics-header">
      <div><span className="sv-kicker">Marketing</span><h1>Local SEO</h1><p>See what Servonas already knows about your business and where that information can help more local customers find you.</p><small>{business.name}</small></div>
    </header>
    <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`}>Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`}>Google Ads</Link><Link href={`/app/${businessSlug}/marketing/meta-ads`}>Meta Ads</Link><Link href={`/app/${businessSlug}/marketing/seo`} aria-current="page">Local SEO</Link></nav>
    {query.error && <div className="workspace-notice error">{query.error}</div>}
    {query.success && <div className="workspace-notice success">{query.success}</div>}

    <section className="workspace-panel local-seo-score">
      <div>
        <span className="sv-kicker">Servonas SEO Score</span>
        <h2>{report.score} / {report.maxScore}</h2>
        <p>{report.summary}</p>
        <small>Your Servonas SEO Score measures how completely your website and local profiles represent your business. It is not a score provided by Google.</small>
      </div>
      <div className="local-seo-score-facts">
        <article><strong>{report.highPriority.length}</strong><span>High priority</span></article>
        <article><strong>{report.mediumPriority.length}</strong><span>Medium priority</span></article>
        <article><strong>{unansweredReviews.length}</strong><span>Reviews awaiting reply</span></article>
        <article><strong>{serviceAreas.length}</strong><span>Configured service areas</span></article>
      </div>
    </section>
    <section className="workspace-panel">
      <header><div><h2>Google Search Console</h2><p>See what people search for before they reach your website. Search performance is separate from Servonas booking attribution.</p></div></header>
      {searchConsoleState?.status==="connected"&&searchConsoleState.property_url?<>{currentSearchRows.length?<><div className="local-seo-search-status"><div><strong>Google search data connected ✓</strong><span>{friendlyWebsiteName(searchConsoleState.property_url)}</span><small>{searchConsoleState.last_synced_at?`Updated ${compactDate(searchConsoleState.last_synced_at)}`:"Updating from Google…"}</small></div><details><summary>Settings</summary><a href={`/api/google-search-console/connect/${encodeURIComponent(businessSlug)}`}>Change website or reconnect</a></details></div><div className="local-seo-search-report"><div><h3>How people are finding you</h3><p>Here is what Google has reported for the most recent 28 days.</p><div className="local-seo-search-kpis"><article><strong>{currentSearchSummary.impressions.toLocaleString()}</strong><span>Times you appeared on Google</span>{percentChange(currentSearchSummary.impressions,previousSearchSummary.impressions)!==null?<small>{percentChange(currentSearchSummary.impressions,previousSearchSummary.impressions)!}% from the previous 28 days</small>:null}</article><article><strong>{currentSearchSummary.clicks.toLocaleString()}</strong><span>Visits from Google</span>{percentChange(currentSearchSummary.clicks,previousSearchSummary.clicks)!==null?<small>{percentChange(currentSearchSummary.clicks,previousSearchSummary.clicks)!}% from the previous 28 days</small>:null}</article></div></div><div><h3>What people are searching for</h3><div className="local-seo-search-table" role="region" aria-label="Google searches"><table><thead><tr><th>Search</th><th>Times shown</th><th>Visits</th></tr></thead><tbody>{topSearches.map(search=><tr key={search.query}><td><strong>{search.query}</strong><small>{search.impressions?`Usually appears around result #${Math.round(search.positionWeighted/search.impressions)}`:null}</small></td><td>{search.impressions.toLocaleString()}</td><td>{search.clicks.toLocaleString()}</td></tr>)}</tbody></table></div></div><details className="local-seo-search-details"><summary>Search details</summary><p>People clicked your result {currentSearchSummary.impressions?`${Math.round(currentSearchSummary.clicks/currentSearchSummary.impressions*100)}% of the time it appeared`:"when it appeared"}. Average position is an estimate, not a fixed rank.</p></details><div className="local-growth-primary"><span>What should I do next?</span>{searchDemandCity?<><strong>People are searching for {searchDemandCity}</strong><p>Google has shown your business for several {searchDemandCity} searches. Build a helpful {searchDemandCity} page so those customers can find the right information.</p><Link className="sv-button" href={`/app/${businessSlug}/marketing/seo?pendingLocation=${encodeURIComponent(searchDemandCity)}#add-location`}>Build a {searchDemandCity} page</Link></>:lowClickLocation?<><strong>Improve your {lowClickLocation.page.city||"location"} page</strong><p>Google is beginning to show this page, but it has not brought visits yet. Strengthen its title, description, and useful local content before creating another page for the same city.</p><Link className="sv-button" href={`/app/${businessSlug}/marketing/seo/locations/${lowClickLocation.page.id}`}>Improve page</Link></>:serviceSearchOpportunity?<><strong>Strengthen your {serviceSearchOpportunity.name} content</strong><p>People are searching for a service you offer. Make sure your website gives them a clear page with helpful details and a way to book.</p><Link className="sv-button" href={`/app/${businessSlug}/settings/website`}>Review website content</Link></>:<><strong>Keep building useful local pages</strong><p>Google is collecting search data. Continue publishing clear pages for the areas you serve, then review what customers search for here.</p></>}</div></div></>:<div className="dashboard-empty"><strong>Google is connected.</strong><p>We&apos;re collecting your search data and will start showing opportunities here as they become available.</p><details><summary>Settings</summary><a href={`/api/google-search-console/connect/${encodeURIComponent(businessSlug)}`}>Change website or reconnect</a></details></div>}</>:searchConsoleState?.status==="property_selection_required"?<form action={selectSearchConsoleProperty.bind(null,businessSlug)}><h3>Connect your website to Google</h3><p>Servonas can see what people search for when your business appears on Google and use that information to recommend ways to get found by more customers.</p>{recommendedSearchConsoleProperty?<div className="local-seo-card priority-healthy"><span className="local-seo-badge">Recommended</span><strong>{recommendedSearchConsoleProperty.name}</strong><small>Matches your Servonas website</small></div>:null}{hasSingleRecommendedSearchConsoleProperty&&recommendedSearchConsoleProperty?<input type="hidden" name="property" value={recommendedSearchConsoleProperty.value}/>:<fieldset><legend>Choose your business website</legend>{searchConsoleChoices.map(choice=><label key={choice.value} className="local-seo-choice"><input type="radio" name="property" value={choice.value} defaultChecked={choice.recommended} required/><span><strong>{choice.name}</strong>{choice.recommended?<small>Recommended · Matches your Servonas website</small>:null}</span></label>)}</fieldset>}<button className="sv-button">Use {recommendedSearchConsoleProperty?.name??"this website"}</button><small>Read-only access — Servonas cannot make changes to your Google account.</small><details><summary>What is this?</summary><p>Google provides this information to website owners. It helps Servonas show how customers find your business in Google search.</p></details></form>:<><p>{searchConsoleState?.status==="permission_denied"?"Google denied access. Reconnect with access to your business website.":searchConsoleState?.last_error_message||searchConsoleResult.error?.message||"Connect Search Console to see organic impressions, clicks, queries, and location-page opportunities."}</p><a className="sv-button" href={`/api/google-search-console/connect/${encodeURIComponent(businessSlug)}`}>Connect your website to Google</a></>}
    </section>

    <section className="workspace-panel local-seo-location-opportunities">
      <header><div><h2>Local growth plan</h2><p>Servonas recommends the next useful step after each location page goes live.</p></div></header>
      <div className="local-seo-card-list">{locationCards.length?locationCards.map(({location,page,recommendation})=>{
        const city=location.name.split(",")[0]!.trim();
        const opportunityAction=locationOpportunityAction(city,page);
        const pageUrl=page?`${websiteBase}/${page.slug}`:null;
        const serviceAreaSupported=serviceAreas.some(area=>area.toLowerCase().includes(city.toLowerCase()));
        if(page?.status==="published"&&pageUrl){
          const normalizedPageUrl=pageUrl.replace(/\/$/,"");
          const organicRows=currentSearchRows.filter((row:any)=>normalizeSearchConsoleUrl(String(row.page_url))===normalizeSearchConsoleUrl(normalizedPageUrl));
          const organic=organicRows.reduce((sum:any,row:any)=>({clicks:sum.clicks+Number(row.clicks??0),impressions:sum.impressions+Number(row.impressions??0),positionTotal:sum.positionTotal+Number(row.position??0)*Number(row.impressions??0)}),{clicks:0,impressions:0,positionTotal:0});
          const topQueries=[...organicRows].sort((a:any,b:any)=>Number(b.impressions??0)-Number(a.impressions??0)).slice(0,5);
          const googleAdsStatus=googleAdsConnection?.status==="connected"&&googleAdsConnection.google_ads_customer_id?"connected":googleAdsConnection?"setup_incomplete":"disconnected";
          const growth=buildLocalGrowthPlan({businessSlug,city,pageUrl:normalizedPageUrl,pageLive:website?.status==="published",metadataReady:Boolean(page.page_title&&page.meta_description),sitemapReady:website?.status==="published",internallyLinked:serviceAreaSupported,serviceAreaSupported,googleBusinessConnected:["connected","account_discovery_rate_limited"].includes(googleConnection?.status??""),googleAdsStatus,locationPromotionExists:(googleAdGroups??[]).some(group=>group.status==="published"&&String(group.destination_url??"").replace(/\/$/,"")===normalizedPageUrl),trackingReady:website?.status==="published"});
          return <article className="local-seo-card location-opportunity-card local-growth-card priority-healthy" id={`location-${city.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`} key={location.id}>
            <span className="local-seo-badge">Location page published</span><h3>Grow {city}</h3><p>Your page is live. Now let&apos;s help local customers find it.</p>
            {searchConsoleState?.status==="connected"?<div className="local-seo-health-list"><strong>Google Search — Last 28 days</strong>{organicRows.length?<><article><span>Times shown on Google</span><span>{organic.impressions}</span></article><article><span>Visits from Google</span><span>{organic.clicks}</span></article><article><span>Click rate</span><span>{organic.impressions?`${Math.round(organic.clicks/organic.impressions*100)}%`:"—"}</span></article><article><span>Average result position</span><span>{organic.impressions?(organic.positionTotal/organic.impressions).toFixed(1):"—"}</span></article>{topQueries.length?<article><span>Top searches</span><span>{topQueries.map((row:any)=>row.query).filter(Boolean).join(" · ")}</span></article>:null}</>:<article><span>Search activity</span><span>{currentSearchRows.length?"Google has not reported search activity for this page yet.":"Google is still collecting search data for this page."}</span></article>}</div>:null}
            {growth.serviceAreaWarning?<div className="workspace-notice error">{growth.serviceAreaWarning}</div>:growth.primary?<div className="local-growth-primary"><span>Recommended next</span><strong>{growth.primary.title}</strong><p>{growth.primary.explanation}</p>{growth.primary.actionHref&&growth.primary.actionLabel?<Link className="sv-button" href={growth.primary.actionHref}>{growth.primary.actionLabel}</Link>:null}</div>:<div className="local-growth-primary is-complete"><span>Growth plan active</span><strong>Review your results</strong><p>Servonas has completed the available setup checks for this location.</p></div>}
            <ol className="local-growth-steps">{growth.steps.map(step=><li className={`is-${step.status}`} key={step.id}><i aria-hidden="true">{step.status==="complete"?"✓":""}</i><div><strong>{step.title}</strong><span>{step.explanation}</span></div>{step===growth.primary&&step.actionHref&&step.actionLabel?<Link href={step.actionHref}>{step.actionLabel}</Link>:null}</li>)}</ol>
            <div className="local-seo-actions"><a className="sv-button sv-secondary" href={pageUrl} target="_blank" rel="noreferrer">View {city} Page</a><Link className="text-button" href={`/app/${businessSlug}/marketing/seo/locations/${page.id}`}>Edit page</Link></div>
          </article>;
        }
        return <article className={`local-seo-card location-opportunity-card ${recommendation?.priority==="high"?"priority-high":"priority-medium"}`} key={location.id}><span className="local-seo-badge">{opportunityAction.state}</span><h3>{page?.status==="draft"?`Review your ${city} draft`:`${location.name} is a strong location-page opportunity`}</h3><p>{page?.status==="draft"?"Servonas created the page from your business information. Review it, then publish when ready.":`People nearby search for services in ${city}. A dedicated ${city} page can help Google understand that you serve this area.`}</p><div className="location-opportunity-status"><span>{page?"Draft page found":`No ${city} page found`}</span><span>{serviceAreaSupported?`${city} is already in your service area`:location.jobCount90d||location.customerCount?"Existing customer activity confirms this area":"Review service coverage before publishing"}</span><span>{allServices.length?`${allServices.length} business services/products available`:"Add services or products before building"}</span></div><div className="local-seo-actions">{!page?<form action={buildLocationPage.bind(null,businessSlug,location.id,recommendation?.dedupeKey??`local-seo:location-page:${location.id}`)}><LocationPageSubmit label={opportunityAction.label} pendingLabel={`Creating ${city} draft…`}/></form>:page?.status==="draft"?<Link className="sv-button" href={`/app/${businessSlug}/marketing/seo/locations/${page.id}`}>{opportunityAction.label}</Link>:null}<details className="location-opportunity-why"><summary>Why this helps</summary><p>A useful city page gives customers one place to see what you offer in their area and gives Google clearer information about where your business works.</p></details></div></article>;
      }):<div className="dashboard-empty"><strong>No location-page opportunities yet.</strong><p>Servonas will surface cities after it finds configured service areas or real customer activity.</p></div>}</div>
      <details className="local-seo-add-location" id="add-location" open={Boolean(query.pendingLocation)}><summary>+ Add another location</summary>{query.pendingLocation?<div className="local-seo-add-location-confirm"><strong>Add {query.pendingLocation} to your service area?</strong><p>This location is not currently listed as an area you serve. Servonas will add it before building the page.</p><form action={addLocalSeoLocation.bind(null,businessSlug)}><input type="hidden" name="location" value={query.pendingZip||query.pendingLocation}/><button className="sv-button" name="addToServiceArea" value="yes">Add to service area and continue</button><Link className="text-button" href={`/app/${businessSlug}/marketing/seo#add-location`}>Cancel</Link></form></div>:<form action={addLocalSeoLocation.bind(null,businessSlug)}><label>City or ZIP<input name="location" required maxLength={100} placeholder="Queen Creek, AZ or 85142"/></label><button className="sv-button">Build Page</button></form>}</details>
    </section>

    <section className="local-seo-columns">
      <section className="workspace-panel">
        <header><div><h2>High priority</h2><p>Start here for the clearest gaps Servonas can support with real business data.</p></div></header>
        <div className="local-seo-card-list">{report.highPriority.length ? report.highPriority.map((item) => <article className="local-seo-card priority-high" key={item.dedupeKey}><span className="local-seo-badge">High priority</span><h3>{item.title}</h3><p>{item.explanation}</p><ul>{item.evidence.map((line) => <li key={line}>{line}</li>)}</ul><div className="local-seo-actions">{item.draft ? <Link className="sv-button sv-secondary" href={`/app/${businessSlug}/marketing/seo?preview=${encodeURIComponent(item.dedupeKey)}`}>Preview page</Link> : item.type === "unanswered_review" ? <Link className="sv-button sv-secondary" href={`/app/${businessSlug}/notifications?category=reviews`}>Open reviews</Link> : item.type === "missing_business_profile_connection" ? <Link className="sv-button sv-secondary" href={`/app/${businessSlug}/settings/website`}>Connect Google</Link> : null}{item.draft ? <form action={saveLocalSeoDraft.bind(null, businessSlug, { sourceEntityType: item.entityType === "location" ? "location" : "service", sourceEntityId: item.entityId, targetType: item.entityType === "location" ? "website_location_page" : "website_service_page", dedupeKey: item.dedupeKey, draft: JSON.stringify(item.draft) })}><button className="sv-button">Create page draft</button></form> : <form action={updateLocalSeoRecommendationState.bind(null, businessSlug, item.dedupeKey, "completed")}><button className="sv-button">Mark complete</button></form>}<form action={updateLocalSeoRecommendationState.bind(null, businessSlug, item.dedupeKey, "dismissed")}><button className="text-button">Dismiss</button></form></div></article>) : <div className="dashboard-empty"><strong>No urgent Local SEO issues.</strong><p>Servonas did not find any high-priority gaps right now.</p></div>}</div>
      </section>

      <section className="workspace-panel">
        <header><div><h2>Medium priority</h2><p>Useful follow-up improvements once the biggest gaps are addressed.</p></div></header>
        <div className="local-seo-card-list">{report.mediumPriority.length ? report.mediumPriority.map((item) => <article className="local-seo-card priority-medium" key={item.dedupeKey}><span className="local-seo-badge">Medium priority</span><h3>{item.title}</h3><p>{item.explanation}</p><ul>{item.evidence.map((line) => <li key={line}>{line}</li>)}</ul><div className="local-seo-actions">{item.draft ? <Link className="sv-button sv-secondary" href={`/app/${businessSlug}/marketing/seo?preview=${encodeURIComponent(item.dedupeKey)}`}>Preview page</Link> : item.type === "unanswered_review" ? <Link className="sv-button sv-secondary" href={`/app/${businessSlug}/notifications?category=reviews`}>Open reviews</Link> : null}{item.draft ? <form action={saveLocalSeoDraft.bind(null, businessSlug, { sourceEntityType: item.entityType === "location" ? "location" : "service", sourceEntityId: item.entityId, targetType: item.entityType === "location" ? "website_location_page" : "website_service_page", dedupeKey: item.dedupeKey, draft: JSON.stringify(item.draft) })}><button className="sv-button">Create page draft</button></form> : <form action={updateLocalSeoRecommendationState.bind(null, businessSlug, item.dedupeKey, "completed")}><button className="sv-button">Mark complete</button></form>}<form action={updateLocalSeoRecommendationState.bind(null, businessSlug, item.dedupeKey, "dismissed")}><button className="text-button">Dismiss</button></form></div></article>) : <div className="dashboard-empty"><strong>No medium-priority Local SEO issues.</strong><p>Servonas did not find additional medium-priority gaps right now.</p></div>}</div>
      </section>
    </section>

    {previewRecommendation?.draft ? <section className="workspace-panel local-seo-preview">
      <header><div><h2>Page draft preview</h2><p>{previewRecommendation.draft.summary}</p></div></header>
      <div className="local-seo-preview-meta">
        <article><span>URL</span><strong>{previewRecommendation.draft.slug}</strong></article>
        <article><span>Title</span><strong>{previewRecommendation.draft.title}</strong></article>
        <article><span>Meta description</span><strong>{previewRecommendation.draft.metaDescription}</strong></article>
        <article><span>Canonical</span><strong>{previewRecommendation.draft.canonicalPath}</strong></article>
      </div>
      <div className="local-seo-preview-sections">{previewRecommendation.draft.sections.map((section) => <article key={section.title}><h3>{section.title}</h3><p>{section.body}</p></article>)}</div>
      <form action={saveLocalSeoDraft.bind(null, businessSlug, { sourceEntityType: previewRecommendation.entityType === "location" ? "location" : "service", sourceEntityId: previewRecommendation.entityId, targetType: previewRecommendation.entityType === "location" ? "website_location_page" : "website_service_page", dedupeKey: previewRecommendation.dedupeKey, draft: JSON.stringify(previewRecommendation.draft) })}><button className="sv-button">Save this draft</button></form>
    </section> : null}

    <section className="local-seo-columns">
      <section className="workspace-panel">
        <header><div><h2>Google Business Profile</h2><p>Use connected Google data where Servonas has it, and keep capability limits explicit.</p></div></header>
        <div className="local-seo-health-list">
          <article><strong>Status</strong><span>{googleConnection?.status === "connected" ? `Connected${googleConnection.location_title ? ` · ${googleConnection.location_title}` : ""}` : "Not connected"}</span></article>
          <article><strong>Reviews</strong><span>{profileReviews?.reviewCount ?? 0} total · {unansweredReviews.length} awaiting reply</span></article>
          <article><strong>Services audit</strong><span>{googleConnection?.status === "connected" ? "Servonas can prepare service suggestions and saved mappings." : "Connect Google Business Profile to audit services."}</span></article>
          <article><strong>Products support</strong><span>Capability-based. Servonas should not assume every profile supports products.</span></article>
        </div>
      </section>

      <section className="workspace-panel">
        <header><div><h2>Healthy</h2><p>Signals that already support a stronger local presence.</p></div></header>
        <div className="local-seo-card-list">{report.healthy.map((item) => <article className="local-seo-card priority-healthy" key={item.dedupeKey}><span className="local-seo-badge">Healthy</span><h3>{item.title}</h3><p>{item.explanation}</p><ul>{item.evidence.map((line) => <li key={line}>{line}</li>)}</ul></article>)}</div>
      </section>
    </section>

    <section className="workspace-panel">
      <header><div><h2>Review opportunities</h2><p>Unanswered Google reviews are surfaced here and remain manageable in the notification center.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/notifications?category=reviews`}>Open reviews</Link></header>
      <div className="local-seo-review-list">{unansweredReviews.length ? unansweredReviews.map((review) => <article key={review.reviewId}><strong>{review.author}</strong><span>{review.rating} / 5{compactDate(review.publishedAt) ? ` · ${compactDate(review.publishedAt)}` : ""}</span><p>{review.text}</p></article>) : <div className="dashboard-empty"><strong>No unanswered Google reviews.</strong><p>Servonas did not find any current review-reply opportunities.</p></div>}</div>
    </section>
  </section></main>;
}
