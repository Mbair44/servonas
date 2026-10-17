/**
 * A deliberately narrow escape hatch for an isolated end-to-end test.  These
 * values are server-only deployment configuration, never tenant settings or
 * request parameters.  Leaving any value unset disables the path.
 */
export type RestrictedSmartUpsellTestConfig={businessId:string;bookingId:string;stripeAccountId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function restrictedSmartUpsellTestConfig():RestrictedSmartUpsellTestConfig|null{
 const businessId=process.env.SMART_UPSELL_TEST_BUSINESS_ID??"",bookingId=process.env.SMART_UPSELL_TEST_BOOKING_ID??"",stripeAccountId=process.env.SMART_UPSELL_TEST_STRIPE_ACCOUNT_ID??"";
 if(process.env.SMART_UPSELL_RESTRICTED_TEST_MODE_ENABLED!=="true"||process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED==="true"||!uuid.test(businessId)||!uuid.test(bookingId)||!/^acct_[A-Za-z0-9]+$/.test(stripeAccountId)||!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"))return null;
 return {businessId,bookingId,stripeAccountId};
}

export function isRestrictedSmartUpsellTestOffer(offer:{business_id:string;booking_id:string;offer_metadata?:Record<string,unknown>|null}){
 const config=restrictedSmartUpsellTestConfig();
 return Boolean(config&&offer.business_id===config.businessId&&offer.booking_id===config.bookingId&&offer.offer_metadata?.restricted_test===true);
}

export function assertRestrictedSmartUpsellTestBooking(businessId:string,bookingId:string){
 const config=restrictedSmartUpsellTestConfig();
 if(!config||config.businessId!==businessId||config.bookingId!==bookingId)throw new Error("Restricted Smart Upsell test mode is not enabled for this booking.");
 return config;
}
