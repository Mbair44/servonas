import test from "node:test";
import assert from "node:assert/strict";
import {buildMetaCampaignTraffic} from "../lib/metaCampaignTraffic.ts";

test("uses unique first-party sessions as the campaign conversion denominator",()=>{
 const rows=buildMetaCampaignTraffic({promotions:[{id:"p1",name:"Fall Party Special",slug:"fall-party-special"}],performance:[{campaign_id:"m1",campaign_name:"Fall Party Special",link_clicks:19}],sessions:[{id:"s1",first_landing_path:"/fall-party-special?x=1",utm_source:"facebook",utm_medium:"paid_social",utm_campaign:"Fall Party Special",fbclid:"f1"},{id:"s2",first_landing_path:"/fall-party-special",utm_source:"instagram",utm_medium:"paid_social",utm_campaign:"Fall Party Special",fbclid:null}],events:[{attribution_session_id:"s1",event_name:"promotion_landing_view"},{attribution_session_id:"s1",event_name:"promotion_landing_view"},{attribution_session_id:"s1",event_name:"checkout_started"},{attribution_session_id:"s1",event_name:"booking_completed"}]});
 const promotion=rows.find(row=>row.kind==="promotion")!;
 assert.equal(promotion.metaLinkClicks,19);assert.equal(promotion.uniqueLandingSessions,2);assert.equal(promotion.promotionLandingViews,2);assert.equal(promotion.fbclidSessions,1);assert.equal(promotion.metaUtmSessions,2);assert.equal(promotion.checkoutStarts,1);assert.equal(promotion.bookings,1);assert.equal(promotion.landingToCheckout,.5);assert.equal(promotion.landingToBooking,.5);
});
