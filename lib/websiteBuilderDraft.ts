import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkAcquisitionSession, safeAcquisitionMetadata } from "./acquisitionFunnel";

const draftCookieName = "servonas_website_builder_draft";
const draftLifetimeSeconds = 60 * 60 * 24 * 14;

type DraftRow = {
  id: string;
  token_hash: string;
  business_id: string;
  source: string;
  acquisition_session_id: string | null;
  email: string | null;
  current_step: "business" | "style" | "preview" | "claimed" | "completed";
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  expires_at: string;
  metadata: Record<string, unknown> | null;
};

export function createWebsiteBuilderDraftToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashWebsiteBuilderDraftToken(token) };
}

export function hashWebsiteBuilderDraftToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function setWebsiteBuilderDraftCookie(token: string) {
  const store = await cookies();
  store.set(draftCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: draftLifetimeSeconds,
  });
}

export async function clearWebsiteBuilderDraftCookie() {
  const store = await cookies();
  store.delete(draftCookieName);
}

export async function getWebsiteBuilderDraftToken() {
  const store = await cookies();
  return store.get(draftCookieName)?.value ?? "";
}

export async function loadWebsiteBuilderDraftByToken(
  db: SupabaseClient,
  token: string,
) {
  if (!token) return null;
  const tokenHash = hashWebsiteBuilderDraftToken(token);
  const { data } = await db
    .from("website_builder_drafts")
    .select("id,token_hash,business_id,source,acquisition_session_id,email,current_step,claimed_by_user_id,claimed_at,expires_at,metadata")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<DraftRow>();
  return data ?? null;
}

export async function loadWebsiteBuilderDraftForBusinessSlug(
  db: SupabaseClient,
  businessSlug: string,
) {
  const token = await getWebsiteBuilderDraftToken();
  const draft = await loadWebsiteBuilderDraftByToken(db, token);
  if (!draft) return null;
  const { data: business } = await db
    .from("businesses")
    .select("id,slug")
    .eq("id", draft.business_id)
    .eq("slug", businessSlug)
    .eq("is_deleted", false)
    .maybeSingle<{ id: string; slug: string }>();
  if (!business) return null;
  return draft;
}

export async function claimWebsiteBuilderDraftForUser(
  db: SupabaseClient,
  userId: string,
) {
  const token = await getWebsiteBuilderDraftToken();
  const draft = await loadWebsiteBuilderDraftByToken(db, token);
  if (!draft || draft.claimed_by_user_id) return null;
  const claimedAt = new Date().toISOString();
  const { data: business } = await db
    .from("businesses")
    .update({ owner_user_id: userId })
    .eq("id", draft.business_id)
    .is("owner_user_id", null)
    .select("id,slug")
    .maybeSingle<{ id: string; slug: string }>();
  const businessId = business?.id ?? draft.business_id;
  await db.from("business_members").upsert(
    {
      business_id: businessId,
      user_id: userId,
      role: "owner",
    },
    { onConflict: "business_id,user_id" },
  );
  await db
    .from("website_builder_drafts")
    .update({
      claimed_by_user_id: userId,
      claimed_at: claimedAt,
      current_step: "claimed",
      updated_at: claimedAt,
    })
    .eq("id", draft.id);
  await db
    .from("business_website_onboarding_states")
    .update({
      current_step: draft.current_step === "style" ? "style" : "preview",
      updated_by: userId,
      updated_at: claimedAt,
    })
    .eq("business_id", businessId)
    .eq("source", draft.source);
  if (draft.acquisition_session_id) {
    await linkAcquisitionSession(db, {
      sessionId: draft.acquisition_session_id,
      industry: draft.source,
      userId,
      businessId,
      event: "website_builder_account_created",
    });
    await db.from("website_acquisition_events").insert({
      acquisition_session_id: draft.acquisition_session_id,
      industry: draft.source,
      user_id: userId,
      business_id: businessId,
      event_name: "website_builder_claimed",
      event_key: `${draft.acquisition_session_id}:website_builder_claimed:${businessId}`,
      metadata: safeAcquisitionMetadata({
        current_step: draft.current_step,
      }),
    });
  }
  await clearWebsiteBuilderDraftCookie();
  return { businessId, businessSlug: business?.slug ?? null, source: draft.source };
}

export const websiteBuilderDraftTestUtils = {
  draftCookieName,
  hashWebsiteBuilderDraftToken,
};
