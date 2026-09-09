export type LocalGrowthStepId="google_business"|"google_discovery"|"google_ads"|"tracking";
export type LocalGrowthStepStatus="complete"|"recommended"|"waiting"|"attention";

export type LocalGrowthStep={
 id:LocalGrowthStepId;
 title:string;
 explanation:string;
 status:LocalGrowthStepStatus;
 actionLabel:string|null;
 actionHref:string|null;
};

export type LocalGrowthPlan={
 primary:LocalGrowthStep|null;
 steps:LocalGrowthStep[];
 serviceAreaWarning:string|null;
};
export type LocalGrowthGoogleAdsStatus="disconnected"|"setup_incomplete"|"connected";

export function buildLocalGrowthPlan(input:{
 businessSlug:string;
 city:string;
 pageUrl:string;
 pageLive:boolean;
 metadataReady:boolean;
 sitemapReady:boolean;
 internallyLinked:boolean;
 serviceAreaSupported:boolean;
 googleBusinessConnected:boolean;
 googleAdsStatus:LocalGrowthGoogleAdsStatus;
 locationPromotionExists:boolean;
 trackingReady:boolean;
}):LocalGrowthPlan{
 const seoPath=`/app/${encodeURIComponent(input.businessSlug)}/marketing/seo`;
 const settingsPath=`/app/${encodeURIComponent(input.businessSlug)}/settings/website?step=features`;
 const returnTo=`${seoPath}?focusCity=${encodeURIComponent(input.city)}#location-${encodeURIComponent(input.city.toLowerCase().replace(/[^a-z0-9]+/g,"-"))}`;
 const adsParams=new URLSearchParams({promoteCity:input.city,landingPage:input.pageUrl,returnTo});
 const adsPath=`/app/${encodeURIComponent(input.businessSlug)}/marketing/google-ads?${adsParams.toString()}#google-ads-campaigns`;
 const connectAdsPath=`/api/google-ads/connect/${encodeURIComponent(input.businessSlug)}?${new URLSearchParams({returnTo}).toString()}`;
 const discoveryReady=input.pageLive&&input.metadataReady&&input.sitemapReady&&input.internallyLinked;
 const steps:LocalGrowthStep[]=[
  input.googleBusinessConnected
   ?{id:"google_business",title:"Google Business Profile connected",explanation:"Servonas can use your saved Google profile connection to support local visibility checks.",status:"complete",actionLabel:null,actionHref:null}
   :{id:"google_business",title:"Connect Google Business Profile",explanation:"Your Google Business Profile helps you appear in Google Maps and local searches. Connecting it lets Servonas check your profile and help improve your local visibility.",status:"recommended",actionLabel:"Connect Google Business Profile",actionHref:settingsPath},
  discoveryReady
   ?{id:"google_discovery",title:"Google can find this page",explanation:"The page is live, indexable, included in your sitemap, and linked from your website's service-area section.",status:"complete",actionLabel:null,actionHref:null}
   :{id:"google_discovery",title:"Help Google find this page",explanation:"Servonas found a website setup issue that could keep Google or customers from reaching this page.",status:"attention",actionLabel:"Fix this",actionHref:seoPath},
  input.locationPromotionExists
   ?{id:"google_ads",title:`${input.city} Google Ads active`,explanation:`Google Ads is already using this location page to reach people searching in ${input.city}.`,status:"complete",actionLabel:"View results",actionHref:adsPath}
   :input.googleAdsStatus==="connected"
    ?{id:"google_ads",title:`Promote ${input.city}`,explanation:`Servonas can prepare a focused Google Ads recommendation that sends local searches to this ${input.city} page.`,status:"waiting",actionLabel:`Promote ${input.city}`,actionHref:adsPath}
    :input.googleAdsStatus==="setup_incomplete"
     ?{id:"google_ads",title:"Finish Google Ads setup",explanation:`Your Google login is connected. Finish selecting and verifying the account Servonas should use for ${input.city}.`,status:"waiting",actionLabel:"Finish Google Ads setup",actionHref:adsPath}
     :{id:"google_ads",title:`Promote ${input.city} on Google`,explanation:`Reach people searching for your services in ${input.city}.`,status:"waiting",actionLabel:`Create ${input.city} Ads`,actionHref:connectAdsPath},
  input.trackingReady
   ?{id:"tracking",title:"Local visits and bookings are tracked",explanation:"Servonas uses the existing attribution funnel to connect this landing page with visits, checkout activity, and bookings where available.",status:"complete",actionLabel:null,actionHref:null}
   :{id:"tracking",title:"Track local traffic and bookings",explanation:"Finish the website setup so Servonas can measure visits and booking actions from this page.",status:"waiting",actionLabel:"Review website",actionHref:settingsPath},
 ];
 const order:LocalGrowthStepId[]=["google_business","google_discovery","google_ads","tracking"];
 const primary=order.map(id=>steps.find(step=>step.id===id)!).find(step=>step.status!=="complete")??null;
 return{
  primary:input.serviceAreaSupported?primary:null,
  steps,
  serviceAreaWarning:input.serviceAreaSupported?null:`${input.city} is not in this business's configured service area. Confirm coverage before promoting this page.`,
 };
}
