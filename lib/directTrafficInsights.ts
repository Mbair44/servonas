import {eligibleAttributionTouch,type AttributionTouch} from "./bookingAttributionModels.ts";
import {normalizeMarketingSource,type FunnelEventRow} from "./marketingAttribution.ts";

export type DirectInsightCategory="google_ads"|"meta_ads"|"google_business_profile"|"organic"|"other_known"|"direct_no_prior"|"unknown";
export type DirectInsightRow={category:DirectInsightCategory;label:string;visits:number;bookingInterest:number;checkoutStarts:number;completedBookings:number;revenueCents:number};
type DirectSession={id:string;visitor_id?:string|null;session_started_at?:string|null;utm_source?:string|null;utm_medium?:string|null;utm_campaign?:string|null;first_referrer?:string|null;gclid?:string|null;gbraid?:string|null;wbraid?:string|null;fbclid?:string|null};
type Visitor={visitor_id:string;first_touch?:AttributionTouch|null;last_touch?:AttributionTouch|null;last_non_direct_touch?:AttributionTouch|null};
type Booking={booking_id:string;status?:string|null;total_cents?:number|null;attribution_session_id?:string|null};

const definitions:Array<[DirectInsightCategory,string]>=[
 ["google_ads","Returning from Google Ads"],["meta_ads","Returning from Meta Ads"],["google_business_profile","Returning from Google Business Profile"],["organic","Returning from Organic Search"],["other_known","Returning from Other Known Sources"],["direct_no_prior","Direct / No Prior Source"],["unknown","Unknown / Insufficient Attribution"],
];
const canonical=(event:string)=>({promotion_primary_cta_clicked:"booking_start",promotion_item_selected:"booking_start",booking_date_selection_started:"availability_check",booking_date_selected:"date_selected",initiate_checkout:"checkout_started",landing_page_view:"landing_view",booking_started:"booking_start",inventory_item_clicked:"booking_start",check_availability_clicked:"booking_start",reserve_clicked:"booking_start",availability_check_started:"availability_check",rental_availability_checked:"availability_check",availability_date_selected:"date_selected",event_date_selected:"date_selected",event_date_changed:"date_selected",item_added_to_cart:"item_added"} as Record<string,string>)[event]??event;
const completed=(status:string|null|undefined)=>["confirmed","paid","scheduled","dispatched","en_route","arrived","in_progress","completed"].includes(status??"");

/** Reporting-only Direct breakdown. Current source remains Direct; a category is
 * assigned only when the existing consented visitor ID has an in-lookback,
 * pre-session non-Direct touch. */
export function buildDirectTrafficInsights(input:{sessions:DirectSession[];visitors:Visitor[];events:FunnelEventRow[];bookings:Booking[];lookbackDays?:number}):DirectInsightRow[]{
 const rows=new Map(definitions.map(([category,label])=>[category,{category,label,visits:0,bookingInterest:0,checkoutStarts:0,completedBookings:0,revenueCents:0}]));
 const visitors=new Map(input.visitors.map(visitor=>[visitor.visitor_id,visitor]));
 const categories=new Map<string,DirectInsightCategory>();
 for(const session of input.sessions){
  if(normalizeMarketingSource(session)!=="direct")continue;
  const visitor=session.visitor_id?visitors.get(session.visitor_id):undefined;
  const at=session.session_started_at?new Date(session.session_started_at):new Date();
  const prior=visitor?.last_non_direct_touch&&eligibleAttributionTouch(visitor.last_non_direct_touch,at,input.lookbackDays??30);
  let category:DirectInsightCategory="unknown";
  if(prior&&Date.parse(prior.occurred_at)<at.getTime()){
   // Visitor touches store the canonical reporting source. Older rows may hold
   // raw values, so normalize only when it is not already a canonical value.
   const source=(["google_ads","meta_ads","google_business_profile","organic"] as string[]).includes(prior.source)?prior.source:normalizeMarketingSource({utm_source:prior.source,utm_medium:prior.medium??null,utm_campaign:prior.campaign??null,gclid:prior.gclid??null,gbraid:prior.gbraid??null,wbraid:prior.wbraid??null,fbclid:prior.fbclid??null,first_referrer:prior.referrer??null});
   category=source==="google_ads"?"google_ads":source==="meta_ads"?"meta_ads":source==="google_business_profile"?"google_business_profile":source==="organic"?"organic":"other_known";
  }else if(visitor?.first_touch&&eligibleAttributionTouch(visitor.first_touch,at,input.lookbackDays??30)) category="direct_no_prior";
  categories.set(session.id,category); rows.get(category)!.visits++;
 }
 const interest=new Set<string>(),checkout=new Set<string>();
 for(const event of input.events){const id=event.attribution_session_id??"",category=categories.get(id);if(!category)continue;const name=canonical(String(event.event_name));if(["booking_start","availability_check","date_selected","item_added"].includes(name))interest.add(id);if(name==="checkout_started")checkout.add(id);}
 for(const [id,category] of categories){if(interest.has(id))rows.get(category)!.bookingInterest++;if(checkout.has(id))rows.get(category)!.checkoutStarts++;}
 const seen=new Set<string>();
 for(const booking of input.bookings){const category=booking.attribution_session_id?categories.get(booking.attribution_session_id):undefined;if(!category||!completed(booking.status)||seen.has(booking.booking_id))continue;seen.add(booking.booking_id);const row=rows.get(category)!;row.completedBookings++;row.revenueCents+=Math.max(0,Number(booking.total_cents??0));}
 return definitions.map(([category])=>rows.get(category)!);
}
