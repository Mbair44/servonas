type Promotion={id:string;name:string;slug:string};
type MetaPerformance={campaign_id:string|null;campaign_name:string|null;link_clicks:number|string|null};
type Session={id:string;first_landing_path:string|null;first_landing_url?:string|null;utm_source:string|null;utm_medium:string|null;utm_campaign:string|null;fbclid:string|null};
type Event={attribution_session_id:string|null;event_name:string;metadata?:Record<string,unknown>|null};
export type MetaCampaignTrafficRow={key:string;kind:"promotion"|"meta_campaign";label:string;detail:string;metaLinkClicks:number|null;uniqueLandingSessions:number;promotionLandingViews:number;fbclidSessions:number;metaUtmSessions:number;checkoutStarts:number;bookings:number;purchases:number;landingToCheckout:number|null;landingToBooking:number|null};

const clean=(value:unknown)=>String(value??"").trim().toLowerCase();
const token=(value:unknown)=>clean(value).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const pathOf=(session:Session)=>{const raw=session.first_landing_path||session.first_landing_url||"";try{return new URL(raw,"https://tenant.invalid").pathname.replace(/\/$/,"")||"/";}catch{return String(raw).split("?")[0].replace(/\/$/,"")||"/";}};
const metaUtm=(session:Session)=>["facebook","fb","instagram","ig","meta"].includes(clean(session.utm_source))||/paid[_ -]?social|facebook|instagram|meta/.test(clean(session.utm_medium));
const uniqueFor=(events:Event[],names:Set<string>)=>new Set(events.filter(event=>event.attribution_session_id&&names.has(event.event_name)).map(event=>event.attribution_session_id!)).size;

export function buildMetaCampaignTraffic(input:{promotions:Promotion[];performance:MetaPerformance[];sessions:Session[];events:Event[]}):MetaCampaignTrafficRow[]{
 const campaignMap=new Map<string,{id:string|null;name:string;clicks:number}>();
 for(const metric of input.performance){const id=clean(metric.campaign_id)||null,name=String(metric.campaign_name??metric.campaign_id??"Unnamed Meta campaign"),key=id||token(name);const current=campaignMap.get(key);campaignMap.set(key,{id,name,clicks:(current?.clicks??0)+Number(metric.link_clicks??0)});}
 const make=(key:string,kind:MetaCampaignTrafficRow["kind"],label:string,detail:string,sessions:Session[],metaLinkClicks:number|null)=>{
  const ids=new Set(sessions.map(session=>session.id)),events=input.events.filter(event=>event.attribution_session_id&&ids.has(event.attribution_session_id));
  const views=events.filter(event=>event.event_name===bookingFunnelEventGroups.promotionLanding[0]).length,checkouts=uniqueFor(events,new Set<string>(bookingFunnelEventGroups.checkout)),bookings=uniqueFor(events,new Set<string>(bookingFunnelEventGroups.booking)),purchases=uniqueFor(events,new Set<string>(bookingFunnelEventGroups.purchase)),denominator=sessions.length;
  return{key,kind,label,detail,metaLinkClicks,uniqueLandingSessions:denominator,promotionLandingViews:views,fbclidSessions:sessions.filter(session=>Boolean(session.fbclid)).length,metaUtmSessions:sessions.filter(metaUtm).length,checkoutStarts:checkouts,bookings,purchases,landingToCheckout:denominator?checkouts/denominator:null,landingToBooking:denominator?bookings/denominator:null};
 };
 const rows:MetaCampaignTrafficRow[]=[];
 for(const promotion of input.promotions){const slug=promotion.slug.toLowerCase(),path=`/${slug}`,matches=input.sessions.filter(session=>pathOf(session).toLowerCase()===path||clean(session.utm_campaign)===slug||token(session.utm_campaign)===slug);const matchedCampaign=[...campaignMap.values()].find(campaign=>[token(campaign.name),token(campaign.id)].includes(slug)||token(campaign.name)===token(promotion.name));rows.push(make(`promotion:${promotion.id}`,"promotion",promotion.name,`/${promotion.slug}`,matches,matchedCampaign?.clicks??null));}
 for(const [campaignKey,campaign] of campaignMap){const campaignTokens=new Set([clean(campaign.id),clean(campaign.name),token(campaign.name)].filter(Boolean)),matches=input.sessions.filter(session=>campaignTokens.has(clean(session.utm_campaign))||campaignTokens.has(token(session.utm_campaign)));rows.push(make(`campaign:${campaignKey}`,"meta_campaign",campaign.name,campaign.id?`Meta campaign ${campaign.id}`:"Meta campaign",matches,campaign.clicks));}
 return rows.sort((a,b)=>(b.uniqueLandingSessions-a.uniqueLandingSessions)||(b.metaLinkClicks??-1)-(a.metaLinkClicks??-1)||a.label.localeCompare(b.label));
}
import {bookingFunnelEventGroups} from "./bookingFunnel.ts";
