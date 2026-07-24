"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { canManageCustomers } from "@/lib/access";
import { calculateFinancialDocument, type Discount } from "@/lib/financial/calculations";
import { parseCurrencyToCents } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { generatePublicDocumentToken, publicDocumentTokenHash } from "@/lib/publicDocumentToken";
import { EstimateEmailService } from "@/lib/communications/estimateEmailService";

export type EstimateActionState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };
export type EstimateLineDraft = {
  id?: string; priceBookItemId?: string; serviceId?: string; name: string; description?: string;
  quantity: string; unitType: string; unitPrice: string; internalCost?: string;
  discountType: "none" | "fixed" | "percentage"; discountValue: string;
  taxable: boolean; taxRateBasisPoints: number;
};
export type EstimateFeeDraft = { name: string; amount: string };

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const valuesFrom = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>;
const safeJson = <T,>(value: string, fallback: T): T => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const resultPath = (slug: string, id: string, kind: "success" | "error", message: string) =>
  `/app/${slug}/estimates/${id}?${kind}=${encodeURIComponent(message)}`;
type DatabaseWriteError = { code?: string; message?: string; details?: string; hint?: string };

function estimateWriteFailure(error: DatabaseWriteError | null, operation: "create" | "update"): EstimateActionState {
  console.error(`Estimate ${operation} failed`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
  if (error?.code === "23503") return {
    error: "The selected customer, location, or job is no longer available. Refresh the page and choose it again.",
    fieldErrors: { customerId: "Review the selected customer and service location." },
  };
  if (error?.code === "23514") return {
    error: "The estimate totals, discount, deposit, or dates do not meet the required rules. Review those fields and try again.",
  };
  if (error?.code === "42501") return {
    error: "You no longer have permission to save estimates for this business.",
  };
  if (["PGRST204", "42703", "42P01"].includes(error?.code ?? "")) return {
    error: "Estimate setup is incomplete. An administrator needs to apply the latest Epic 6 database migrations.",
  };
  return {
    error: operation === "create"
      ? "The estimate could not be created. Your entries are still here; please try again."
      : "The estimate could not be saved. Your entries are still here; please try again.",
  };
}

function discount(type: string, raw: string): Discount | null {
  if (type === "none") return { type: "none", value: 0 };
  if (type === "fixed") {
    const value = parseCurrencyToCents(raw);
    return value === null ? null : { type: "fixed", value };
  }
  const percent = Number(raw);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? { type: "percentage", value: Math.round(percent * 100) } : null;
}

async function prepareEstimate(formData: FormData, context: Awaited<ReturnType<typeof requireWorkspace>>) {
  const values = valuesFrom(formData);
  const errors: Record<string, string> = {};
  const lines = safeJson<EstimateLineDraft[]>(text(formData, "linesJson"), []);
  const fees = safeJson<EstimateFeeDraft[]>(text(formData, "feesJson"), []);
  const customerId = text(formData, "customerId");
  const locationId = text(formData, "serviceLocationId") || null;
  const jobId = text(formData, "jobId") || null;
  const title = text(formData, "title");
  if (!customerId) errors.customerId = "Choose a customer.";
  if (!title) errors.title = "Enter an estimate title.";
  if (!lines.length) errors.lines = "Add at least one line item.";
  const [{ data: customer }, { data: location }, { data: job }] = await Promise.all([
    customerId ? context.supabase.from("customers").select("id").eq("id", customerId).eq("business_id", context.business.id).eq("is_deleted", false).maybeSingle() : Promise.resolve({ data: null }),
    locationId ? context.supabase.from("service_locations").select("id,customer_id").eq("id", locationId).eq("business_id", context.business.id).eq("is_deleted", false).maybeSingle() : Promise.resolve({ data: null }),
    jobId ? context.supabase.from("jobs").select("id,customer_id").eq("id", jobId).eq("business_id", context.business.id).eq("is_deleted", false).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (customerId && !customer) errors.customerId = "Customer does not belong to this business.";
  if (locationId && (!location || location.customer_id !== customerId)) errors.serviceLocationId = "Location does not belong to this customer.";
  if (jobId && (!job || job.customer_id !== customerId)) errors.jobId = "Job does not belong to this customer.";

  const lineInputs = lines.map((line, index) => {
    const price = parseCurrencyToCents(line.unitPrice);
    const cost = parseCurrencyToCents(line.internalCost || "0");
    const lineDiscount = discount(line.discountType, line.discountValue || "0");
    if (!line.name.trim() || price === null || cost === null || !lineDiscount) errors.lines = `Correct line ${index + 1}.`;
    return { currency: "USD", quantity: line.quantity, unitPriceCents: price ?? -1, taxable: line.taxable, taxRateBasisPoints: line.taxRateBasisPoints, discount: lineDiscount ?? undefined };
  });
  const feeCents = fees.map((fee, index) => {
    const amount = parseCurrencyToCents(fee.amount);
    if (!fee.name.trim() || amount === null) errors.fees = `Correct fee ${index + 1}.`;
    return amount ?? -1;
  });
  const documentDiscount = discount(text(formData, "documentDiscountType"), text(formData, "documentDiscountValue") || "0");
  const deposit = discount(text(formData, "depositType"), text(formData, "depositValue") || "0");
  if (!documentDiscount) errors.documentDiscountValue = "Enter a valid document discount.";
  if (!deposit) errors.depositValue = "Enter a valid deposit.";
  let totals;
  if (!Object.keys(errors).length) {
    try {
      totals = calculateFinancialDocument({ currency: "USD", lines: lineInputs, feesCents: feeCents, documentDiscount: documentDiscount!, deposit: deposit! });
    } catch (error) {
      errors.lines = error instanceof Error ? error.message : "Estimate totals are invalid.";
    }
  }
  if (Object.keys(errors).length || !totals) return { error: "Please correct the highlighted fields.", errors, values };
  const issueDate = text(formData, "issueDate") || null;
  const expirationDate = text(formData, "expirationDate") || null;
  if (issueDate && expirationDate && expirationDate < issueDate) return { error: "Expiration must be on or after the issue date.", errors: { expirationDate: "Choose a later date." }, values };
  return {
    values, lines, fees, totals,
    payload: {
      customer_id: customerId, service_location_id: locationId, job_id: jobId, title,
      customer_message: text(formData, "customerMessage") || null,
      internal_notes: text(formData, "internalNotes") || null,
      currency: "USD", subtotal_cents: totals.subtotalCents,
      discount_total_cents: totals.discountTotalCents, tax_total_cents: totals.taxTotalCents,
      fee_total_cents: totals.feeTotalCents, grand_total_cents: totals.grandTotalCents,
      deposit_type: text(formData, "depositType"), deposit_value: deposit!.value,
      deposit_required_cents: totals.depositRequiredCents, amount_paid_cents: 0,
      amount_refunded_cents: 0, balance_due_cents: totals.balanceDueCents,
      document_discount_type: text(formData, "documentDiscountType"),
      document_discount_value: documentDiscount!.value, issue_date: issueDate, expiration_date: expirationDate,
    },
  };
}

async function replaceEstimateChildren(
  context: Awaited<ReturnType<typeof requireWorkspace>>, estimateId: string,
  prepared: Extract<Awaited<ReturnType<typeof prepareEstimate>>, { payload: object }>,
) {
  const { supabase, business } = context;
  const [lineDelete, feeDelete] = await Promise.all([
    supabase.from("estimate_line_items").delete().eq("business_id", business.id).eq("estimate_id", estimateId),
    supabase.from("estimate_fees").delete().eq("business_id", business.id).eq("estimate_id", estimateId),
  ]);
  if (lineDelete.error || feeDelete.error) return lineDelete.error ?? feeDelete.error;
  const lineRows = prepared.lines.map((line, index) => {
    const calculated = prepared.totals.lines[index];
    const discountValue = discount(line.discountType, line.discountValue || "0")?.value ?? 0;
    return {
      business_id: business.id, estimate_id: estimateId,
      price_book_item_id: line.priceBookItemId || null, service_id: line.serviceId || null,
      name_snapshot: line.name.trim(), description_snapshot: line.description?.trim() || null,
      quantity: line.quantity, unit_type_snapshot: line.unitType,
      unit_price_cents: parseCurrencyToCents(line.unitPrice)!, internal_unit_cost_cents: parseCurrencyToCents(line.internalCost || "0")!,
      discount_type: line.discountType, discount_value: discountValue,
      line_discount_cents: calculated.lineDiscountCents + calculated.documentDiscountShareCents,
      is_taxable: line.taxable, tax_rate_basis_points: line.taxRateBasisPoints,
      line_subtotal_cents: calculated.lineSubtotalCents, tax_amount_cents: calculated.taxCents,
      line_total_cents: calculated.lineTotalCents, sort_order: index,
    };
  });
  const feeRows = prepared.fees.map((fee, index) => ({
    business_id: business.id, estimate_id: estimateId, name_snapshot: fee.name.trim(),
    amount_cents: parseCurrencyToCents(fee.amount)!, sort_order: index,
  }));
  const [lineInsert, feeInsert] = await Promise.all([
    supabase.from("estimate_line_items").insert(lineRows),
    feeRows.length ? supabase.from("estimate_fees").insert(feeRows) : Promise.resolve({ error: null }),
  ]);
  return lineInsert.error ?? feeInsert.error;
}

export async function createEstimate(slug: string, _state: EstimateActionState, formData: FormData): Promise<EstimateActionState> {
  const context = await requireWorkspace(slug);
  const values = valuesFrom(formData);
  if (!canManageCustomers(context.role)) return { error: "You do not have permission to create estimates.", values };
  const requestKey = text(formData, "requestKey");
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) return { error: "Refresh the page before submitting.", values };
  const { data: existing } = await context.supabase.from("estimates").select("id").eq("business_id", context.business.id).eq("request_key", requestKey).maybeSingle();
  if (existing) redirect(`/app/${slug}/estimates/${existing.id}`);
  const prepared = await prepareEstimate(formData, context);
  if (!prepared.payload || !prepared.lines || !prepared.fees || !prepared.totals) return { error: prepared.error, fieldErrors: prepared.errors, values: prepared.values };
  const { data: number, error: numberError } = await context.supabase.rpc("next_financial_document_number", { p_business_id: context.business.id, p_document_type: "estimate" });
  if (numberError || !number) {
    console.error("Estimate numbering failed", {
      code: numberError?.code,
      message: numberError?.message,
      details: numberError?.details,
      hint: numberError?.hint,
      businessId: context.business.id,
    });
    return {
      error: numberError && ["PGRST202", "42883", "42P01"].includes(numberError.code)
        ? "Estimate numbering is not installed. An administrator needs to apply the Epic 6 Checkpoint 1 migration."
        : "Estimate numbering is temporarily unavailable. Please try again.",
      values,
    };
  }
  const { data: estimate, error } = await context.supabase.from("estimates").insert({
    ...prepared.payload, business_id: context.business.id, estimate_number: number, status: "draft", request_key: requestKey,
    created_by: context.user.id, updated_by: context.user.id,
  }).select("id").single();
  if (error || !estimate) {
    if (error?.code === "23505") {
      const { data: duplicate } = await context.supabase.from("estimates").select("id")
        .eq("business_id", context.business.id).eq("request_key", requestKey).maybeSingle();
      if (duplicate) redirect(`/app/${slug}/estimates/${duplicate.id}`);
    }
    return { ...estimateWriteFailure(error, "create"), values };
  }
  const childError = await replaceEstimateChildren(context, estimate.id, prepared);
  if (childError) {
    await context.supabase.from("estimates").update({ is_deleted: true }).eq("id", estimate.id);
    console.error("Estimate lines creation failed", { code: childError.code, businessId: context.business.id, estimateId: estimate.id });
    return { error: "The estimate header was reserved, but its line items could not be saved.", values };
  }
  await context.supabase.from("estimate_events").insert({ business_id: context.business.id, estimate_id: estimate.id, event_type: "created", actor_user_id: context.user.id });
  revalidatePath(`/app/${slug}/estimates`);
  redirect(`/app/${slug}/estimates/${estimate.id}?success=Estimate+created`);
}

export async function updateEstimate(slug: string, estimateId: string, _state: EstimateActionState, formData: FormData): Promise<EstimateActionState> {
  const context = await requireWorkspace(slug);
  if (!canManageCustomers(context.role)) return { error: "You do not have permission to edit estimates." };
  const { data: current } = await context.supabase.from("estimates").select("id,status").eq("id", estimateId).eq("business_id", context.business.id).eq("is_deleted", false).maybeSingle();
  if (!current) return { error: "Estimate not found." };
  if (current.status !== "draft") return { error: "Revise this estimate before changing financial terms." };
  const prepared = await prepareEstimate(formData, context);
  if (!prepared.payload || !prepared.lines || !prepared.fees || !prepared.totals) return { error: prepared.error, fieldErrors: prepared.errors, values: prepared.values };
  const { error } = await context.supabase.from("estimates").update({ ...prepared.payload, updated_by: context.user.id }).eq("id", estimateId).eq("business_id", context.business.id);
  if (error) return { ...estimateWriteFailure(error, "update"), values: prepared.values };
  const childError = await replaceEstimateChildren(context, estimateId, prepared);
  if (childError) return { error: "Estimate details saved, but its line items could not be replaced.", values: prepared.values };
  await context.supabase.from("estimate_events").insert({ business_id: context.business.id, estimate_id: estimateId, event_type: "updated", actor_user_id: context.user.id });
  revalidatePath(`/app/${slug}/estimates/${estimateId}`);
  redirect(resultPath(slug, estimateId, "success", "Estimate updated"));
}

async function estimateSnapshot(supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"], businessId: string, estimateId: string) {
  const [{ data: estimate }, { data: lines }, { data: fees }] = await Promise.all([
    supabase.from("estimates").select("*").eq("id", estimateId).eq("business_id", businessId).maybeSingle(),
    supabase.from("estimate_line_items").select("*").eq("estimate_id", estimateId).eq("business_id", businessId).order("sort_order"),
    supabase.from("estimate_fees").select("*").eq("estimate_id", estimateId).eq("business_id", businessId).order("sort_order"),
  ]);
  return { estimate, lines: lines ?? [], fees: fees ?? [] };
}

export async function sendEstimate(slug: string, estimateId: string) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(resultPath(slug, estimateId, "error", "Permission denied"));
  const snapshot = await estimateSnapshot(supabase, business.id, estimateId);
  if (!snapshot.estimate || snapshot.estimate.status !== "draft" || !snapshot.lines.length) redirect(resultPath(slug, estimateId, "error", "Only complete draft estimates can be sent"));
  const snapshotText = JSON.stringify({ estimate: snapshot.estimate, lines: snapshot.lines, fees: snapshot.fees });
  const snapshotHash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshotText))).toString("hex");
  const { error: versionError } = await supabase.from("estimate_versions").insert({
    business_id: business.id, estimate_id: estimateId, version_number: snapshot.estimate.version_number,
    document_snapshot: { ...snapshot.estimate, fees: snapshot.fees }, line_items_snapshot: snapshot.lines,
    snapshot_hash: snapshotHash, created_by: user.id,
  });
  if (versionError && versionError.code !== "23505") redirect(resultPath(slug, estimateId, "error", "Estimate snapshot could not be created"));
  const now = new Date().toISOString();
  const publicToken = generatePublicDocumentToken();
  const publicTokenHash = await publicDocumentTokenHash(publicToken);
  const { error } = await supabase.from("estimates").update({
    status: "sent", sent_at: now, issue_date: snapshot.estimate.issue_date || now.slice(0, 10),
    public_token_hash: publicTokenHash, public_token_revoked_at: null, updated_by: user.id,
  }).eq("id", estimateId).eq("business_id", business.id).eq("status", "draft");
  if (error) redirect(resultPath(slug, estimateId, "error", "Estimate could not be marked sent"));
  await supabase.from("estimate_events").insert({ business_id: business.id, estimate_id: estimateId, event_type: "sent", actor_user_id: user.id });
  revalidatePath(`/app/${slug}/estimates`);
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "http://localhost:3000").replace(/\/$/, "");
  const publicLink = `${origin}/estimate/${publicToken}`;
  const delivery = await EstimateEmailService.send(estimateId, publicToken);
  if(!delivery.ok||"stubbed" in delivery){
    const detail="adminDetail" in delivery?delivery.adminDetail:"No provider diagnostic was returned.";
    redirect(`/app/${slug}/estimates/${estimateId}?error=${encodeURIComponent(`Estimate sent, but email was not delivered. ${detail}`)}&publicLink=${encodeURIComponent(publicLink)}`);
  }
  redirect(`/app/${slug}/estimates/${estimateId}?success=${encodeURIComponent("Estimate sent and delivery recorded")}&publicLink=${encodeURIComponent(publicLink)}`);
}

export async function resendEstimateEmail(slug:string,estimateId:string){
  const {supabase,business,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(resultPath(slug,estimateId,"error","Permission denied"));
  const {data:estimate}=await supabase.from("estimates").select("id,status")
    .eq("id",estimateId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle();
  if(!estimate||!["sent","viewed"].includes(estimate.status))redirect(resultPath(slug,estimateId,"error","Only open sent estimates can be emailed"));
  const publicToken=generatePublicDocumentToken();
  const publicTokenHash=await publicDocumentTokenHash(publicToken);
  const {error:tokenError}=await supabase.from("estimates").update({
    public_token_hash:publicTokenHash,public_token_revoked_at:null,
  }).eq("id",estimateId).eq("business_id",business.id);
  if(tokenError){
    console.error("Estimate resend token rotation failed",{code:tokenError.code,businessId:business.id,estimateId});
    redirect(resultPath(slug,estimateId,"error","A new secure estimate link could not be created"));
  }
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||(await headers()).get("origin")||"http://localhost:3000").replace(/\/$/,"");
  const publicLink=`${origin}/estimate/${publicToken}`;
  const delivery=await EstimateEmailService.send(estimateId,publicToken);
  if(!delivery.ok||"stubbed" in delivery){
    const detail="adminDetail" in delivery?delivery.adminDetail:"No provider diagnostic was returned.";
    redirect(`/app/${slug}/estimates/${estimateId}?error=${encodeURIComponent(`Email was not delivered. ${detail}`)}&publicLink=${encodeURIComponent(publicLink)}`);
  }
  if("duplicate" in delivery)redirect(`/app/${slug}/estimates/${estimateId}?success=${encodeURIComponent("This estimate version was already delivered")}&publicLink=${encodeURIComponent(publicLink)}`);
  redirect(`/app/${slug}/estimates/${estimateId}?success=${encodeURIComponent("Estimate email sent")}&publicLink=${encodeURIComponent(publicLink)}`);
}

export async function reviseEstimate(slug: string, estimateId: string) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(resultPath(slug, estimateId, "error", "Permission denied"));
  const { data: current } = await supabase.from("estimates").select("version_number,status").eq("id", estimateId).eq("business_id", business.id).maybeSingle();
  if (!current || !["sent", "viewed"].includes(current.status)) redirect(resultPath(slug, estimateId, "error", "Only sent or viewed estimates can be revised"));
  const { error } = await supabase.from("estimates").update({
    status: "draft", version_number: Number(current.version_number) + 1, updated_by: user.id,
  }).eq("id", estimateId).eq("business_id", business.id).in("status", ["sent", "viewed"]);
  if (error) redirect(resultPath(slug, estimateId, "error", "Estimate could not be revised"));
  revalidatePath(`/app/${slug}/estimates/${estimateId}`);
  redirect(`/app/${slug}/estimates/${estimateId}/edit?success=Revision+started`);
}

export async function voidEstimate(slug: string, estimateId: string) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(resultPath(slug, estimateId, "error", "Permission denied"));
  const { error } = await supabase.from("estimates").update({
    status: "void", voided_at: new Date().toISOString(), voided_by: user.id, updated_by: user.id,
  }).eq("id", estimateId).eq("business_id", business.id).not("status", "in", '("converted","void")');
  if (error) redirect(resultPath(slug, estimateId, "error", "Estimate could not be voided"));
  await supabase.from("estimate_events").insert({ business_id: business.id, estimate_id: estimateId, event_type: "voided", actor_user_id: user.id });
  revalidatePath(`/app/${slug}/estimates`);
  redirect(resultPath(slug, estimateId, "success", "Estimate voided"));
}

export async function duplicateEstimate(slug: string, estimateId: string) {
  const context = await requireWorkspace(slug);
  if (!canManageCustomers(context.role)) redirect(resultPath(slug, estimateId, "error", "Permission denied"));
  const snapshot = await estimateSnapshot(context.supabase, context.business.id, estimateId);
  if (!snapshot.estimate) redirect(`/app/${slug}/estimates?error=Estimate+not+found`);
  const { data: number } = await context.supabase.rpc("next_financial_document_number", { p_business_id: context.business.id, p_document_type: "estimate" });
  const source = snapshot.estimate;
  const { data: copy, error } = await context.supabase.from("estimates").insert({
    business_id: context.business.id, estimate_number: number, customer_id: source.customer_id,
    service_location_id: source.service_location_id, job_id: source.job_id, status: "draft",
    title: `${source.title} (copy)`, customer_message: source.customer_message, internal_notes: source.internal_notes,
    currency: source.currency, subtotal_cents: source.subtotal_cents, discount_total_cents: source.discount_total_cents,
    tax_total_cents: source.tax_total_cents, fee_total_cents: source.fee_total_cents, grand_total_cents: source.grand_total_cents,
    deposit_type: source.deposit_type, deposit_value: source.deposit_value, deposit_required_cents: source.deposit_required_cents,
    balance_due_cents: source.grand_total_cents, document_discount_type: source.document_discount_type,
    document_discount_value: source.document_discount_value, expiration_date: source.expiration_date,
    created_by: context.user.id, updated_by: context.user.id,
  }).select("id").single();
  if (error || !copy) redirect(resultPath(slug, estimateId, "error", "Estimate could not be duplicated"));
  const lineCopies = snapshot.lines.map((line) => ({ ...line, id: undefined, created_at: undefined, updated_at: undefined, estimate_id: copy.id }));
  const feeCopies = snapshot.fees.map((fee) => ({ ...fee, id: undefined, created_at: undefined, estimate_id: copy.id }));
  await Promise.all([
    context.supabase.from("estimate_line_items").insert(lineCopies),
    feeCopies.length ? context.supabase.from("estimate_fees").insert(feeCopies) : Promise.resolve(),
  ]);
  redirect(`/app/${slug}/estimates/${copy.id}?success=Estimate+duplicated`);
}

export async function convertEstimateToJob(slug: string, estimateId: string) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(resultPath(slug, estimateId, "error", "Permission denied"));
  const { data: estimate } = await supabase.from("estimates").select("*").eq("id", estimateId).eq("business_id", business.id).maybeSingle();
  if (!estimate || !["accepted", "sent", "viewed"].includes(estimate.status)) redirect(resultPath(slug, estimateId, "error", "This estimate cannot be converted"));
  if (estimate.converted_job_id) redirect(`/app/${slug}/jobs/${estimate.converted_job_id}`);
  const { data: existing } = await supabase.from("jobs").select("id").eq("business_id", business.id).eq("request_key", estimate.id).maybeSingle();
  let jobId = existing?.id;
  if (!jobId) {
    const { data: job, error } = await supabase.from("jobs").insert({
      business_id: business.id, customer_id: estimate.customer_id, service_location_id: estimate.service_location_id,
      title: estimate.title, description: estimate.customer_message, internal_notes: estimate.internal_notes,
      status: "pending", booking_source: "estimate", request_key: estimate.id,
      subtotal: (estimate.subtotal_cents + estimate.fee_total_cents) / 100, tax_amount: estimate.tax_total_cents / 100,
      discount_amount: estimate.discount_total_cents / 100, created_by: user.id, updated_by: user.id,
    }).select("id").single();
    if (error || !job) redirect(resultPath(slug, estimateId, "error", "Job could not be created"));
    jobId = job.id;
  }
  await supabase.from("estimates").update({ converted_job_id: jobId, conversion_key: estimate.id, status: "converted", updated_by: user.id }).eq("id", estimateId).eq("business_id", business.id);
  await supabase.from("estimate_events").insert({ business_id: business.id, estimate_id: estimateId, event_type: "converted_to_job", actor_user_id: user.id, metadata: { job_id: jobId } });
  redirect(`/app/${slug}/jobs/${jobId}?success=Created+from+estimate`);
}

export async function convertEstimateToInvoice(slug: string, estimateId: string) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(resultPath(slug, estimateId, "error", "Permission denied"));
  const snapshot = await estimateSnapshot(supabase, business.id, estimateId);
  if (!snapshot.estimate || !["accepted", "converted"].includes(snapshot.estimate.status)) redirect(resultPath(slug, estimateId, "error", "Only accepted estimates can be invoiced"));
  const { data: existing } = await supabase.from("invoices").select("id").eq("business_id", business.id).eq("source_key", estimateId).maybeSingle();
  if (existing) redirect(`/app/${slug}/invoices/${existing.id}?success=Invoice+already+exists+for+this+estimate`);
  const { data: number } = await supabase.rpc("next_financial_document_number", { p_business_id: business.id, p_document_type: "invoice" });
  const estimate = snapshot.estimate;
  const { data: invoice, error } = await supabase.from("invoices").insert({
    business_id: business.id, invoice_number: number, customer_id: estimate.customer_id,
    service_location_id: estimate.service_location_id, job_id: estimate.converted_job_id || estimate.job_id,
    estimate_id: estimate.id, source_key: estimate.id, status: "draft", title: estimate.title,
    currency: estimate.currency, customer_notes: estimate.customer_message, internal_notes: estimate.internal_notes,
    subtotal_cents: estimate.subtotal_cents, discount_total_cents: estimate.discount_total_cents,
    tax_total_cents: estimate.tax_total_cents, fee_total_cents: estimate.fee_total_cents,
    grand_total_cents: estimate.grand_total_cents, deposit_type: estimate.deposit_type,
    deposit_value: estimate.deposit_value, deposit_required_cents: estimate.deposit_required_cents,
    document_discount_type: estimate.document_discount_type,
    document_discount_value: estimate.document_discount_value,
    balance_due_cents: estimate.grand_total_cents, created_by: user.id, updated_by: user.id,
  }).select("id").single();
  if (error || !invoice) redirect(resultPath(slug, estimateId, "error", "Invoice could not be created"));
  await supabase.from("invoice_line_items").insert(snapshot.lines.map((line) => ({
    business_id: business.id, invoice_id: invoice.id, price_book_item_id: line.price_book_item_id,
    estimate_line_item_id: line.id, service_id: line.service_id, name_snapshot: line.name_snapshot,
    description_snapshot: line.description_snapshot, quantity: line.quantity, unit_type_snapshot: line.unit_type_snapshot,
    unit_price_cents: line.unit_price_cents, internal_unit_cost_cents: line.internal_unit_cost_cents,
    discount_type: line.discount_type, discount_value: line.discount_value, line_discount_cents: line.line_discount_cents,
    is_taxable: line.is_taxable, tax_rate_basis_points: line.tax_rate_basis_points,
    line_subtotal_cents: line.line_subtotal_cents, tax_amount_cents: line.tax_amount_cents,
    line_total_cents: line.line_total_cents, sort_order: line.sort_order,
  })));
  if(snapshot.fees.length)await supabase.from("invoice_fees").insert(snapshot.fees.map((fee)=>({
    business_id:business.id,invoice_id:invoice.id,name_snapshot:fee.name_snapshot,
    amount_cents:fee.amount_cents,sort_order:fee.sort_order,
  })));
  await supabase.from("invoice_events").insert({ business_id: business.id, invoice_id: invoice.id, event_type: "created", actor_user_id: user.id, metadata: { estimate_id: estimate.id } });
  redirect(`/app/${slug}/invoices/${invoice.id}?success=${encodeURIComponent(`Invoice ${number} created from estimate`)}`);
}
