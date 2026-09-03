import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type NotificationCategory = "reviews" | "marketing" | "customers" | "payments" | "system";
export type NotificationPriority = "info" | "normal" | "important" | "urgent";
export type NotificationStatus = "unread" | "read" | "resolved" | "dismissed";
export type BusinessNotification = { id: string; business_id: string; type: string; category: NotificationCategory; title: string; body: string; status: NotificationStatus; priority: NotificationPriority; action_label: string | null; action_url: string | null; external_resource_id: string | null; metadata: Record<string, unknown>; created_at: string; read_at: string | null; resolved_at: string | null };

export function reviewNotificationPriority(rating: number): NotificationPriority {
 if (rating <= 2) return "urgent";
 if (rating === 3) return "important";
 return "normal";
}

export async function createBusinessNotification(input: { businessId: string; type: string; category: NotificationCategory; title: string; body?: string; priority?: NotificationPriority; actionLabel?: string | null; actionUrl?: string | null; externalResourceId?: string | null; dedupeKey: string; metadata?: Record<string, unknown> }) {
 const db = getSupabaseAdmin(); if (!db) throw new Error("Notification storage is unavailable.");
 const now = new Date().toISOString();
 const { data, error } = await db.from("business_notifications").upsert({ business_id: input.businessId, type: input.type, category: input.category, title: input.title.slice(0, 240), body: (input.body ?? "").slice(0, 2_000), priority: input.priority ?? "normal", action_label: input.actionLabel ?? null, action_url: input.actionUrl ?? null, external_resource_id: input.externalResourceId ?? null, dedupe_key: input.dedupeKey.slice(0, 300), metadata: input.metadata ?? {}, updated_at: now }, { onConflict: "business_id,dedupe_key", ignoreDuplicates: true }).select("*").maybeSingle();
 if (error) throw new Error("Notification could not be saved.");
 return data as BusinessNotification | null;
}

export async function notificationCounts(businessId: string) {
 const db = getSupabaseAdmin(); if (!db) return { unread: 0 };
 const { count } = await db.from("business_notifications").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "unread");
 return { unread: count ?? 0 };
}

export async function syncGoogleBusinessReviewNotifications(input:{businessId:string;businessSlug:string}) {
 const {getGoogleBusinessProfileReviews}=await import("@/lib/googleBusinessProfile");
 const db=getSupabaseAdmin();if(!db)return {created:0};
 const {data:preferences}=await db.from("business_notification_preferences").select("google_reviews_enabled").eq("business_id",input.businessId).maybeSingle();
 if(preferences?.google_reviews_enabled===false)return {created:0};
 const profile=await getGoogleBusinessProfileReviews(input.businessId);if(!profile)return {created:0};
 let created=0;
 for(const review of profile.reviews){
  if(review.reply||!review.reviewId)continue;
  const result=await createBusinessNotification({businessId:input.businessId,type:"google_business_review",category:"reviews",title:review.rating<=2?`New ${review.rating}-star Google review needs attention`:"New Google review",body:`${review.author}: ${review.text}`,priority:reviewNotificationPriority(review.rating),actionLabel:"Reply",actionUrl:`/app/${input.businessSlug}/notifications?category=reviews&notification=${encodeURIComponent(review.reviewId)}`,externalResourceId:review.reviewId,dedupeKey:`google-business-review:${review.reviewId}`,metadata:{reviewId:review.reviewId,author:review.author,rating:review.rating,text:review.text,publishedAt:review.publishedAt,reply:review.reply}});
  if(result)created++;
 }
 return {created};
}
