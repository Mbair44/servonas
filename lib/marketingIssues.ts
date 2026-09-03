import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { NotificationCategory, NotificationPriority, NotificationStatus } from "@/lib/businessNotifications";

export type MarketingIssueProvider = "google_ads";
export type MarketingIssueSeverity = "info" | "warning" | "critical";
export type MarketingIssueStatus = "active" | "resolved" | "dismissed";
export type MarketingIssueRecord = {
 id: string;
 business_id: string;
 provider: MarketingIssueProvider;
 integration_account_id: string | null;
 issue_type: string;
 severity: MarketingIssueSeverity;
 title: string;
 message: string;
 recommended_action: string | null;
 external_resource_type: string | null;
 external_resource_id: string | null;
 detected_at: string;
 last_seen_at: string;
 resolved_at: string | null;
 dismissed_at: string | null;
 status: MarketingIssueStatus;
 dedupe_key: string;
 metadata: Record<string, unknown>;
 created_at: string;
 updated_at: string;
};
export type MarketingIssueInput = {
 provider: MarketingIssueProvider;
 integrationAccountId?: string | null;
 issueType: string;
 severity: MarketingIssueSeverity;
 title: string;
 message: string;
 recommendedAction?: string | null;
 externalResourceType?: string | null;
 externalResourceId?: string | null;
 dedupeKey: string;
 metadata?: Record<string, unknown>;
};

const notificationPriorityForIssue = (severity: MarketingIssueSeverity): NotificationPriority =>
 severity === "critical" ? "urgent" : severity === "warning" ? "important" : "info";

const notificationStatusForIssue = (severity: MarketingIssueSeverity): NotificationStatus =>
 severity === "critical" ? "unread" : "read";

export async function syncBusinessMarketingIssues(input: {
 businessId: string;
 businessSlug: string;
 provider: MarketingIssueProvider;
 integrationAccountId?: string | null;
 issues: MarketingIssueInput[];
 actionUrl: string;
 actionLabel?: string | null;
 notificationCategory?: NotificationCategory;
 checkSucceeded: boolean;
}) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Marketing issue storage is unavailable.");
 const now = new Date().toISOString();
 const notificationCategory = input.notificationCategory ?? "marketing";
 const { data: existingRows, error: existingError } = await db
  .from("business_marketing_issues")
  .select("*")
  .eq("business_id", input.businessId)
  .eq("provider", input.provider);
 if (existingError) throw new Error("Existing marketing issues could not be loaded.");
 const existing = new Map((existingRows ?? []).map((row) => [String(row.dedupe_key), row as MarketingIssueRecord]));
 const activeKeys = new Set<string>();

 for (const issue of input.issues) {
  activeKeys.add(issue.dedupeKey);
  const previous = existing.get(issue.dedupeKey) ?? null;
  const status: MarketingIssueStatus = previous?.status === "dismissed" && issue.severity !== "critical" ? "dismissed" : "active";
  const resolved_at = status === "active" ? null : previous?.resolved_at ?? null;
  const dismissed_at = status === "dismissed" ? (previous?.dismissed_at ?? now) : null;
  const row = {
   business_id: input.businessId,
   provider: input.provider,
   integration_account_id: issue.integrationAccountId ?? input.integrationAccountId ?? null,
   issue_type: issue.issueType,
   severity: issue.severity,
   title: issue.title.slice(0, 240),
   message: issue.message.slice(0, 2000),
   recommended_action: issue.recommendedAction ?? null,
   external_resource_type: issue.externalResourceType ?? null,
   external_resource_id: issue.externalResourceId ?? null,
   detected_at: previous?.detected_at ?? now,
   last_seen_at: now,
   resolved_at,
   dismissed_at,
   status,
   dedupe_key: issue.dedupeKey.slice(0, 300),
   metadata: issue.metadata ?? {},
   updated_at: now,
  };
  const { data: saved, error } = await db.from("business_marketing_issues").upsert(row, { onConflict: "business_id,dedupe_key" }).select("*").maybeSingle();
  if (error) throw new Error("Marketing issue could not be saved.");
  const savedIssue = saved as MarketingIssueRecord | null;
  const notificationMetadata = {
   provider: input.provider,
   severity: issue.severity,
   issueType: issue.issueType,
   issueDedupeKey: issue.dedupeKey,
   issueId: savedIssue?.id ?? previous?.id ?? null,
   recommendedAction: issue.recommendedAction ?? null,
   integrationAccountId: issue.integrationAccountId ?? input.integrationAccountId ?? null,
   ...issue.metadata,
  };
  const notificationRow = {
   business_id: input.businessId,
   type: "marketing_issue",
   category: notificationCategory,
   title: issue.title.slice(0, 240),
   body: issue.message.slice(0, 2000),
   status: notificationStatusForIssue(issue.severity),
   priority: notificationPriorityForIssue(issue.severity),
   action_label: input.actionLabel ?? "View details",
   action_url: input.actionUrl,
   external_resource_id: savedIssue?.id ?? previous?.id ?? null,
   dedupe_key: `marketing-issue:${issue.dedupeKey}`.slice(0, 300),
   metadata: notificationMetadata,
   read_at: issue.severity === "critical" ? null : now,
   dismissed_at: null,
   resolved_at: null,
   updated_at: now,
  };
  const { error: notificationError } = await db.from("business_notifications").upsert(notificationRow, { onConflict: "business_id,dedupe_key" });
  if (notificationError) throw new Error("Marketing issue notification could not be saved.");
 }

 if (input.checkSucceeded) {
  for (const row of existing.values()) {
   if (activeKeys.has(row.dedupe_key)) continue;
   const resolvedAt = now;
   const { error: resolveError } = await db.from("business_marketing_issues").update({
    status: "resolved",
    resolved_at: resolvedAt,
    updated_at: resolvedAt,
   }).eq("business_id", input.businessId).eq("id", row.id).neq("status", "resolved");
   if (resolveError) throw new Error("Resolved marketing issue state could not be saved.");
   const { error: notificationResolveError } = await db.from("business_notifications").update({
    status: "resolved",
    resolved_at: resolvedAt,
    updated_at: resolvedAt,
   }).eq("business_id", input.businessId).eq("dedupe_key", `marketing-issue:${row.dedupe_key}`).not("status", "eq", "resolved");
   if (notificationResolveError) throw new Error("Resolved marketing issue notification could not be saved.");
  }
 }
}
