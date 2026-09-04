import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { getGoogleBusinessProfileReviews } from "@/lib/googleBusinessProfile";
import { buildLocalSeoReport, type LocalSeoLocationInput } from "@/lib/localSeo";
import { saveLocalSeoDraft, updateLocalSeoRecommendationState } from "./actions";

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

export default async function LocalSeoPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string; preview?: string }>;
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
  ] = await Promise.all([
    supabase.from("business_website_settings").select("public_slug,status,custom_domain,domain_status,hero_heading,hero_subheading,about_text,photo_urls").eq("business_id", business.id).maybeSingle(),
    supabase.from("services").select("id,name,description,price_amount,price_label,active").eq("business_id", business.id).eq("is_deleted", false).order("name"),
    supabase.from("inventory_items").select("id,name,description,daily_price_cents,image_url,active").eq("business_id", business.id).eq("active", true).order("name"),
    supabase.from("workforce_territories").select("id,name").eq("business_id", business.id).eq("is_active", true).order("name"),
    supabase.from("bookings").select("id,service_id,created_at,status,service_location_id").eq("business_id", business.id).gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()).in("status", ["confirmed", "paid"]),
    supabase.from("service_locations").select("id,city,state").eq("business_id", business.id).eq("is_deleted", false),
    supabase.from("business_local_seo_recommendation_states").select("dedupe_key,status,dismissed_at,completed_at,metadata").eq("business_id", business.id),
    supabase.from("business_seo_entity_mappings").select("source_entity_type,source_entity_id,target_type,status,metadata").eq("business_id", business.id),
    supabase.from("business_google_profile_connections").select("status,location_title,google_account_id,google_location_id").eq("business_id", business.id).maybeSingle(),
  ]);

  const profileReviews = await getGoogleBusinessProfileReviews(business.id);
  const websiteBase = baseUrl(website?.public_slug ?? business.slug, website?.domain_status === "connected" ? website?.custom_domain ?? null : null);
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
