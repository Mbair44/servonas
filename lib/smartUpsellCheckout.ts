import {hashSmartUpsellToken,prepareSmartUpsellPricing,smartUpsellTokenIsUsable,type SmartUpsellStatus} from "./smartUpsells.ts";
import {isRestrictedSmartUpsellTestOffer,restrictedSmartUpsellTestConfig} from "./smartUpsellRestrictedTest.ts";
type AdminDb=any;

/** Both server-only switches are required. Production remains off unless both are explicitly true. */
export const smartUpsellCheckoutPreparationEnabled=()=>process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED==="true"&&process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED==="true";
export function smartUpsellCheckoutUnavailable(){return "This special offer is not available for online checkout yet. Please contact the business for help.";}
export function smartUpsellOfferCanBeginCheckout(offer:{status:SmartUpsellStatus;expires_at:string|Date;discounted_price_cents:number;additional_delivery_fee_cents:number;tax_cents:number;deposit_cents:number;remaining_balance_increment_cents:number},now=new Date()){if(!["pending","sent","viewed"].includes(offer.status))return false;if(new Date(offer.expires_at).getTime()<=now.getTime())return false;const total=Number(offer.discounted_price_cents)+Number(offer.additional_delivery_fee_cents)+Number(offer.tax_cents);return Number(offer.deposit_cents)+Number(offer.remaining_balance_increment_cents)===total;}
export function assertSmartUpsellCheckoutGate(offer?:{business_id:string;booking_id:string;offer_metadata?:Record<string,unknown>|null}){if(!smartUpsellCheckoutPreparationEnabled()&&!(offer&&isRestrictedSmartUpsellTestOffer(offer)))throw new Error(smartUpsellCheckoutUnavailable());}
export function calculateSmartUpsellTaxCents(input:{discountedPriceCents:number;taxEnabled:boolean;taxCalculationMethod:string|null;taxDisplayMode:string|null;taxRateBasisPoints:number;customerTaxExempt:boolean;itemTaxable:boolean|null|undefined}){
 if(input.taxCalculationMethod==="automatic")throw new Error("This offer requires address-aware tax reconciliation and cannot be checked out online.");
 if(typeof input.itemTaxable!=="boolean")throw new Error("This rental is missing its tax classification.");
 if(!input.taxEnabled||input.customerTaxExempt||!input.itemTaxable)return 0;
 const rate=Math.max(0,Number(input.taxRateBasisPoints)||0),subtotal=Math.max(0,Number(input.discountedPriceCents)||0);
 return input.taxDisplayMode==="inclusive"?Math.round(subtotal*rate/(10000+rate)):Math.round(subtotal*rate/10000);
}

/** Server-only: stage an existing amendment hold; booking lines commit only in the paid webhook. */
export async function prepareSmartUpsellCheckout(db:AdminDb,input:{token:string;origin:string;now?:Date}){
 const now=input.now??new Date(),tokenHash=hashSmartUpsellToken(input.token);
 const {data:offer,error:offerError}=await db.from("smart_upsell_offers").select("*").eq("token_hash",tokenHash).maybeSingle();
 if(offerError||!offer||!smartUpsellTokenIsUsable(offer,now)||!smartUpsellOfferCanBeginCheckout(offer,now))throw new Error("This special offer is no longer available.");
 assertSmartUpsellCheckoutGate(offer);const restrictedTest=isRestrictedSmartUpsellTestOffer(offer),restrictedConfig=restrictedTest?restrictedSmartUpsellTestConfig():null;
 const [{data:booking},{data:item},{data:billing},{data:customer},{data:settings}]=await Promise.all([
  db.from("bookings").select("id,business_id,customer_id,status,rental_starts_at,rental_ends_at,subtotal_cents,discount_cents,discount_snapshot,tax_cents,delivery_fee_cents,total_cents,amount_paid_cents,balance_due_cents,balance_charge_scheduled_for,final_payment_authorized_at").eq("id",offer.booking_id).eq("business_id",offer.business_id).maybeSingle(),
  db.from("inventory_items").select("id,business_id,active,is_taxable").eq("id",offer.inventory_item_id).eq("business_id",offer.business_id).maybeSingle(),
  db.from("business_billing_settings").select("tax_enabled,tax_calculation_method,tax_display_mode,default_tax_rate_basis_points,default_invoice_item_taxable").eq("business_id",offer.business_id).maybeSingle(),
  db.from("customers").select("id,tax_exempt").eq("id",offer.customer_id).eq("business_id",offer.business_id).maybeSingle(),
  db.from("business_smart_upsell_settings").select("enabled").eq("business_id",offer.business_id).maybeSingle(),
 ]);
 if((!settings?.enabled&&!restrictedTest)||!booking||!item?.active||booking.customer_id!==offer.customer_id||booking.rental_starts_at!==offer.rental_starts_at||booking.rental_ends_at!==offer.rental_ends_at||!["paid","confirmed"].includes(booking.status)||new Date(booking.rental_starts_at)<=now)throw new Error("This special offer is no longer eligible.");
 if(!customer)throw new Error("This offer is no longer eligible.");
 if(Number(offer.additional_delivery_fee_cents)!==0)throw new Error("Smart Upsells cannot add a delivery fee.");
 const automatic=Boolean(billing?.tax_enabled&&billing?.tax_calculation_method==="automatic");
 const requoted=automatic?await prepareSmartUpsellPricing(db,{businessId:offer.business_id,inventoryItemId:offer.inventory_item_id,settings:{enabled:true,sendBeforeEventHours:1,discountBasisPoints:Number(offer.discount_basis_points),depositBasisPoints:5000,offerExpirationHours:1,maxOffersPerBooking:1,additionalDeliveryFeeCents:Number(offer.additional_delivery_fee_cents),automaticSelection:true,minimumDiscountedPriceCents:null,smsSendWindowStartHour:0,smsSendWindowEndHour:1},bookingId:offer.booking_id}):null;
 const expectedTax=automatic?Number(requoted!.taxCents):calculateSmartUpsellTaxCents({discountedPriceCents:Number(offer.discounted_price_cents),taxEnabled:Boolean(billing?.tax_enabled),taxCalculationMethod:billing?.tax_calculation_method??null,taxDisplayMode:billing?.tax_display_mode??null,taxRateBasisPoints:Number(billing?.default_tax_rate_basis_points??0),customerTaxExempt:Boolean(customer.tax_exempt),itemTaxable:item.is_taxable});
 if(!Number.isSafeInteger(expectedTax)||(automatic&&Number(requoted!.discountedPriceCents)!==Number(offer.discounted_price_cents))||expectedTax!==Number(offer.tax_cents))throw new Error("This offer's tax snapshot is no longer valid.");
 if(!booking.final_payment_authorized_at||!booking.balance_charge_scheduled_for||new Date(booking.balance_charge_scheduled_for)<=now)throw new Error("This booking's scheduled balance can no longer be safely adjusted online.");
 const addedSubtotal=Number(offer.discounted_price_cents)+Number(offer.additional_delivery_fee_cents),addedTax=Number(offer.tax_cents);
 const newTotals={subtotal_cents:Number(booking.subtotal_cents)+Number(offer.discounted_price_cents),discount_cents:Number(booking.discount_cents),tax_cents:Number(booking.tax_cents)+addedTax,total_cents:Number(booking.total_cents)+addedSubtotal+addedTax,balance_due_cents:Number(booking.balance_due_cents)+addedSubtotal+addedTax};
 const oldTotals={subtotal_cents:Number(booking.subtotal_cents),discount_cents:Number(booking.discount_cents),tax_cents:Number(booking.tax_cents),total_cents:Number(booking.total_cents),balance_due_cents:Number(booking.balance_due_cents),balance_charge_scheduled_for:booking.balance_charge_scheduled_for};
 const pricingSnapshot={smart_upsell_offer_id:offer.id,discount_cents:Number(booking.discount_cents),discount_snapshot:booking.discount_snapshot??null,unit_price_overrides:{[offer.inventory_item_id]:Number(offer.discounted_price_cents)},offer_tax_cents:addedTax,automatic_tax_cents:automatic?addedTax:null,automatic_tax_snapshot:automatic?requoted!.taxSnapshot:null,offer_total_cents:addedSubtotal+addedTax,version:1};
 const {stageBookingItemAmendment}=await import("./bookingManage/stagedAmendments");
 const staged=await stageBookingItemAmendment(db,{businessId:offer.business_id,bookingId:offer.booking_id,items:[{inventoryItemId:offer.inventory_item_id,quantity:1}],pricingSnapshot,oldTotals,newTotals,depositPercent:50,amountPaidCents:Number(booking.amount_paid_cents),requiredPaymentCents:Number(offer.deposit_cents),idempotencyKey:`smart-upsell:${offer.id}`,expiresAt:new Date(Math.min(new Date(offer.expires_at).getTime(),now.getTime()+30*60_000)),successUrl:`${input.origin}/upsell/${input.token}?checkout=processing`,cancelUrl:`${input.origin}/upsell/${input.token}?checkout=cancelled`,stripeMetadata:{smart_upsell_offer_id:offer.id},restrictedTestStripeAccountId:restrictedConfig?.stripeAccountId});
 const {error:updateError}=await db.from("smart_upsell_offers").update({status:"checkout_pending",stripe_checkout_session_id:staged.checkoutSessionId??null,offer_metadata:{...(offer.offer_metadata??{}),amendment_id:staged.amendmentId}}).eq("id",offer.id).eq("business_id",offer.business_id).in("status",["pending","sent","viewed"]);
 if(updateError)throw new Error("The Smart Upsell checkout could not be reserved.");
 return staged;
}
