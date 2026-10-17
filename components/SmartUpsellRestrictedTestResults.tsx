type Db=any;

/** Server-rendered operational status. Tokens are intentionally never selected or rendered. */
export async function SmartUpsellRestrictedTestResults({db,businessId,bookingId}:{db:Db;businessId:string;bookingId:string}){
 const {data:offer}=await db.from("smart_upsell_offers").select("id,status,created_at,stripe_checkout_session_id,stripe_payment_intent_id,offer_metadata").eq("business_id",businessId).eq("booking_id",bookingId).contains("offer_metadata",{restricted_test:true}).order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(!offer)return <section className="workspace-panel"><h2>Restricted test results</h2><p>No restricted test offer has been created for the designated booking.</p></section>;
 const amendmentId=typeof offer.offer_metadata?.amendment_id==="string"?offer.offer_metadata.amendment_id:null;
 const {data:amendment}=amendmentId?await db.from("booking_amendments").select("status,paid_at,applied_at,stripe_checkout_session_id,stripe_payment_intent_id,failure_reason").eq("id",amendmentId).eq("business_id",businessId).maybeSingle():{data:null};
 const applied=amendment?.status==="applied";
 return <section className="workspace-panel"><h2>Restricted test results</h2><div className="pricing-list"><article><strong>Offer created</strong><span>{offer.created_at?"Yes":"No"}</span></article><article><strong>Checkout session created</strong><span>{offer.stripe_checkout_session_id||amendment?.stripe_checkout_session_id?"Yes":"Not yet"}</span></article><article><strong>Payment succeeded</strong><span>{amendment?.paid_at?"Yes":"Not yet"}</span></article><article><strong>Webhook and amendment applied</strong><span>{applied?"Applied":"Not yet"}</span></article><article><strong>Inventory reserved</strong><span>{applied?"Committed with amendment":"Not yet"}</span></article><article><strong>Deposit and balance updated</strong><span>{applied?"Applied through canonical booking payment":"Not yet"}</span></article></div>{amendment?.failure_reason&&<p className="workspace-notice warning">Reconciliation requires review: {amendment.failure_reason}</p>}</section>;
}
