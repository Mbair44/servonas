export type LocalSeoRecommendationType="missing_service_page"|"missing_location_page"|"unanswered_review"|"missing_business_profile_connection"|"missing_google_service";
export type LocalSeoPriority="high"|"medium"|"healthy";
export type LocalSeoStatus="open"|"dismissed"|"completed";

export type LocalSeoServiceInput={id:string;name:string;description?:string|null;price_amount?:number|null;price_label?:string|null;bookingCount90d?:number;imageUrl?:string|null;active?:boolean|null;};
export type LocalSeoLocationInput={id:string;name:string;jobCount90d:number;customerCount:number;reviewCount:number;};
export type LocalSeoReviewInput={reviewId:string;author:string;rating:number;text:string;reply:string|null;publishedAt?:string|null;};
export type LocalSeoStateRow={dedupe_key:string;status:LocalSeoStatus;dismissed_at?:string|null;completed_at?:string|null;metadata?:Record<string,unknown>|null;};
export type LocalSeoMappingRow={source_entity_type:string;source_entity_id:string;target_type:string;status:string;metadata?:Record<string,unknown>|null;};

export type LocalSeoDraft={
 slug:string;
 title:string;
 metaDescription:string;
 canonicalPath:string;
 headings:string[];
 summary:string;
 sections:Array<{title:string;body:string;}>;
};

export type LocalSeoRecommendation={
 dedupeKey:string;
 type:LocalSeoRecommendationType;
 priority:LocalSeoPriority;
 status:LocalSeoStatus;
 title:string;
 explanation:string;
 suggestedAction:string;
 evidence:string[];
 entityType:"service"|"location"|"review"|"google_profile";
 entityId:string;
 entityLabel:string;
 draft:LocalSeoDraft|null;
 metadata:Record<string,unknown>;
 dismissedAt:string|null;
 completedAt:string|null;
};

export type LocalSeoReport={
 score:number;
 maxScore:number;
 summary:string;
 opportunities:number;
 highPriority:LocalSeoRecommendation[];
 mediumPriority:LocalSeoRecommendation[];
 healthy:LocalSeoRecommendation[];
 recommendations:LocalSeoRecommendation[];
};

const slugify=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");
const clean=(value:string|null|undefined)=>value?.trim()||"";
const title=(value:string)=>value.replace(/\b\w/g,(char)=>char.toUpperCase());

function draftForService(input:{businessName:string;phone:string|null;serviceName:string;serviceDescription:string|null;priceLabel:string|null;serviceAreas:string[];reviews:Array<{author:string;text:string;locationLabel?:string|null}>;websiteBasePath:string;}):LocalSeoDraft{
 const slug=`/${slugify(input.serviceName) || "service"}`;
 const price=input.priceLabel?`Starting at ${input.priceLabel}.`:"";
 const areaLabel=input.serviceAreas.slice(0,4).join(", ");
 return {
  slug,
  title:`${input.serviceName} | ${input.businessName}`,
  metaDescription:`${input.businessName} offers ${input.serviceName.toLowerCase()}${areaLabel?` in ${areaLabel}`:""}. ${price}`.trim(),
  canonicalPath:`${input.websiteBasePath}${slug}`,
  headings:[input.serviceName,"What to expect","Why customers choose us","Get started"],
  summary:`A dedicated service-page draft for ${input.serviceName} using your existing business, pricing, service-area, and review data.`,
  sections:[
   {title:input.serviceName,body:[input.serviceDescription||`${input.businessName} provides ${input.serviceName.toLowerCase()} with clear communication and a straightforward next step for customers.`,price,areaLabel?`Common service areas include ${areaLabel}.`:""].filter(Boolean).join(" ")},
   {title:"What to expect",body:`Explain how ${input.serviceName.toLowerCase()} works, who it is for, and what the customer should do next. Keep the booking or request CTA visible.`},
   {title:"Why customers choose us",body:input.reviews.length?input.reviews.slice(0,2).map((review)=>`"${review.text}"${review.locationLabel?` - ${review.author}, ${review.locationLabel}`:` - ${review.author}`}`).join(" "):`Highlight real differentiators for ${input.serviceName.toLowerCase()}, such as response time, equipment quality, or service process.`},
   {title:"Get started",body:`Invite the customer to call${input.phone?` ${input.phone}`:""} or use the website booking/request form for ${input.serviceName.toLowerCase()}.`},
  ],
 };
}

function draftForLocation(input:{businessName:string;phone:string|null;locationName:string;serviceAreas:string[];serviceNames:string[];jobCount90d:number;reviewCount:number;websiteBasePath:string;}):LocalSeoDraft{
 const locationSlug=slugify(input.locationName.replace(/,\s*[A-Z]{2}$/,""));
 const slug=`/areas-we-serve/${locationSlug || "service-area"}`;
 const services=input.serviceNames.slice(0,4).join(", ");
 return {
  slug,
  title:`${title(input.locationName)} | ${input.businessName}`,
  metaDescription:`See how ${input.businessName} serves ${input.locationName}${services?` with ${services.toLowerCase()}`:""} and get in touch for your project.`,
  canonicalPath:`${input.websiteBasePath}${slug}`,
  headings:[`Serving ${title(input.locationName)}`,"Popular services","Recent local activity","Book with confidence"],
  summary:`A location-page draft for ${input.locationName} grounded in actual Servonas service-area and job evidence.`,
  sections:[
   {title:`Serving ${title(input.locationName)}`,body:`${input.businessName} already serves ${input.locationName}. Servonas found ${input.jobCount90d} recent completed job${input.jobCount90d===1?"":"s"} connected to this area.`},
   {title:"Popular services",body:services?`Highlight the services customers most often need here: ${services}.`:"Describe the most relevant services or rentals this area uses."},
   {title:"Recent local activity",body:[input.reviewCount?`${input.reviewCount} recent review${input.reviewCount===1?"":"s"} also support this area.`:"",input.serviceAreas.length?`Nearby areas already shown on the site include ${input.serviceAreas.slice(0,5).join(", ")}.`:""].filter(Boolean).join(" ") || "Add local proof only when Servonas can support it with real work, photos, or customer feedback."},
   {title:"Book with confidence",body:`Keep contact details and booking or request CTAs visible, and cross-link relevant service pages naturally.`},
  ],
 };
}

function mergeState<T extends {dedupeKey:string;status:LocalSeoStatus;dismissedAt:string|null;completedAt:string|null;metadata:Record<string,unknown>}>(items:T[],states:LocalSeoStateRow[]){
 const byKey=new Map(states.map((state)=>[state.dedupe_key,state]));
 return items.map((item)=>{
  const state=byKey.get(item.dedupeKey);
  return state?{...item,status:state.status,dismissedAt:state.dismissed_at??null,completedAt:state.completed_at??null,metadata:{...item.metadata,...(state.metadata??{})}}:item;
 });
}

export function buildLocalSeoReport(input:{
 businessName:string;
 phone:string|null;
 websiteBasePath:string;
 serviceAreas:string[];
 websiteStatus:"published"|"draft"|"missing";
 googleBusinessConnected:boolean;
 googleBusinessLocationTitle:string|null;
 googleBusinessSupportsServices:boolean;
 services:LocalSeoServiceInput[];
 locations:LocalSeoLocationInput[];
 unansweredReviews:LocalSeoReviewInput[];
 mappings:LocalSeoMappingRow[];
 states:LocalSeoStateRow[];
 reviewSnippets:Array<{author:string;text:string;locationLabel?:string|null;}>;
}):LocalSeoReport{
 const publishedWebsite=input.websiteStatus==="published";
 const recommendations:LocalSeoRecommendation[]=[];
 const servicePageMappings=new Set(input.mappings.filter((row)=>row.target_type==="website_service_page" && ["draft","planned","published"].includes(row.status)).map((row)=>`${row.source_entity_type}:${row.source_entity_id}`));
 const locationPageMappings=new Set(input.mappings.filter((row)=>row.target_type==="website_location_page" && ["draft","planned","published"].includes(row.status)).map((row)=>`${row.source_entity_type}:${row.source_entity_id}`));
 const googleServiceMappings=new Set(input.mappings.filter((row)=>row.target_type==="google_business_service" && ["draft","planned","published","synced"].includes(row.status)).map((row)=>`${row.source_entity_type}:${row.source_entity_id}`));

 for(const service of input.services.filter((item)=>item.active!==false)){
  const demand=service.bookingCount90d ?? 0;
  if(servicePageMappings.has(`service:${service.id}`) || servicePageMappings.has(`inventory_item:${service.id}`))continue;
  if(demand < 2 && input.services.length > 4)continue;
  recommendations.push({
   dedupeKey:`local-seo:service-page:${service.id}`,
   type:"missing_service_page",
   priority:demand >= 8 ? "high" : "medium",
   status:"open",
   title:`${service.name} does not have a dedicated service page`,
   explanation:`Customers may search specifically for ${service.name.toLowerCase()}, but Servonas does not have a dedicated page draft for it yet.`,
   suggestedAction:"Preview and create a page draft",
   evidence:[
    "Active service in Servonas",
    demand ? `${demand} bookings in the last 90 days` : "Configured service without a dedicated page",
    publishedWebsite ? "Website is already published" : "Website draft exists but is not published yet",
   ],
   entityType:"service",
   entityId:service.id,
   entityLabel:service.name,
   draft:draftForService({businessName:input.businessName,phone:input.phone,serviceName:service.name,serviceDescription:clean(service.description)||null,priceLabel:service.price_label??(service.price_amount!=null?`$${Number(service.price_amount).toFixed(2)}`:null),serviceAreas:input.serviceAreas,reviews:input.reviewSnippets,websiteBasePath:input.websiteBasePath}),
   metadata:{bookingCount90d:demand},
   dismissedAt:null,
   completedAt:null,
  });
  if(input.googleBusinessConnected && input.googleBusinessSupportsServices && !googleServiceMappings.has(`service:${service.id}`)){
   recommendations.push({
    dedupeKey:`local-seo:google-service:${service.id}`,
    type:"missing_google_service",
    priority:demand >= 6 ? "high" : "medium",
    status:"open",
    title:`${service.name} is not mapped to Google Business Profile`,
    explanation:`Servonas has ${service.name} in your service catalog, but it is not represented in the saved Google Business service mappings yet.`,
    suggestedAction:"Review Google service suggestion",
    evidence:["Active service in Servonas",demand?`${demand} bookings in the last 90 days`:"No booking-demand signal yet","Google Business Profile is connected"],
    entityType:"service",
    entityId:service.id,
    entityLabel:service.name,
    draft:null,
    metadata:{bookingCount90d:demand},
    dismissedAt:null,
    completedAt:null,
   });
  }
 }

 for(const location of input.locations){
  if(locationPageMappings.has(`location:${location.id}`))continue;
  if(location.jobCount90d < 3 && location.customerCount < 3 && location.reviewCount < 2)continue;
  recommendations.push({
   dedupeKey:`local-seo:location-page:${location.id}`,
   type:"missing_location_page",
   priority:location.jobCount90d >= 10 || location.reviewCount >= 3 ? "high" : "medium",
   status:"open",
   title:`${location.name} is a strong location-page opportunity`,
   explanation:`Servonas found real customer activity in ${location.name}, but there is no saved location-page draft for this area yet.`,
   suggestedAction:"Preview and create a location-page draft",
   evidence:[
    `${location.jobCount90d} completed jobs in the last 90 days`,
    `${location.customerCount} customer location${location.customerCount===1?"":"s"}`,
    `${location.reviewCount} unanswered or recent Google review${location.reviewCount===1?"":"s"} associated with this area`,
   ],
   entityType:"location",
   entityId:location.id,
   entityLabel:location.name,
   draft:draftForLocation({businessName:input.businessName,phone:input.phone,locationName:location.name,serviceAreas:input.serviceAreas,serviceNames:input.services.slice(0,5).map((service)=>service.name),jobCount90d:location.jobCount90d,reviewCount:location.reviewCount,websiteBasePath:input.websiteBasePath}),
   metadata:{jobCount90d:location.jobCount90d,customerCount:location.customerCount,reviewCount:location.reviewCount},
   dismissedAt:null,
   completedAt:null,
  });
 }

 for(const review of input.unansweredReviews){
  recommendations.push({
   dedupeKey:`local-seo:review:${review.reviewId}`,
   type:"unanswered_review",
   priority:review.rating <= 3 ? "high" : "medium",
   status:"open",
   title:`${review.author} left a Google review without a reply`,
   explanation:`Timely replies help reinforce trust and keep your Google presence current.`,
   suggestedAction:"Reply in the notification center",
   evidence:[`${review.rating} star review`,review.publishedAt?`Published ${review.publishedAt}`:"Recent review","No business reply saved yet"],
   entityType:"review",
   entityId:review.reviewId,
   entityLabel:review.author,
   draft:null,
   metadata:{rating:review.rating},
   dismissedAt:null,
   completedAt:null,
  });
 }

 if(!input.googleBusinessConnected){
  recommendations.push({
   dedupeKey:"local-seo:google-business-connection",
   type:"missing_business_profile_connection",
   priority:"high",
   status:"open",
   title:"Google Business Profile is not connected",
   explanation:"Servonas cannot audit services, reviews, or profile completeness until the business profile connection is available.",
   suggestedAction:"Connect Google Business Profile",
   evidence:["No connected Google Business Profile record found"],
   entityType:"google_profile",
   entityId:"google-business-profile",
   entityLabel:"Google Business Profile",
   draft:null,
   metadata:{},
   dismissedAt:null,
   completedAt:null,
  });
 }

 const healthy:LocalSeoRecommendation[]=[
  {
   dedupeKey:"local-seo:healthy:website",
   type:"missing_service_page",
   priority:"healthy",
   status:"completed",
   title:publishedWebsite?"Website is published":"Website draft is ready to improve",
   explanation:publishedWebsite?"Your site is live and ready for SEO improvements.":"Your site exists in Servonas and can support SEO improvements after publishing.",
   suggestedAction:"Open website settings",
   evidence:[publishedWebsite?"Published website detected":"Website settings found"],
   entityType:"google_profile",
   entityId:"website",
   entityLabel:"Website",
   draft:null,
   metadata:{},
   dismissedAt:null,
   completedAt:null,
  },
  {
   dedupeKey:"local-seo:healthy:google",
   type:"missing_business_profile_connection",
   priority:"healthy",
   status:input.googleBusinessConnected?"completed":"open",
   title:input.googleBusinessConnected?`Google Business Profile connected${input.googleBusinessLocationTitle?`: ${input.googleBusinessLocationTitle}`:""}`:"Google Business Profile not yet connected",
   explanation:input.googleBusinessConnected?"Servonas can use this connection for review and profile audits.":"Connect Google Business Profile to unlock profile audits and review workflows.",
   suggestedAction:"Review connection",
   evidence:[input.googleBusinessConnected?"Connected state detected":"Connection missing"],
   entityType:"google_profile",
   entityId:"google-business-profile",
   entityLabel:"Google Business Profile",
   draft:null,
   metadata:{},
   dismissedAt:null,
   completedAt:null,
  },
 ];

 const merged=mergeState([...recommendations,...healthy],input.states);
 const actionable=merged.filter((item)=>item.priority!=="healthy");
 const openActionable=actionable.filter((item)=>item.status==="open");
 const healthyItems=merged.filter((item)=>item.priority==="healthy" || item.status==="completed");
 const maxScore=100;
 const penalties=openActionable.reduce((sum,item)=>sum+(item.priority==="high"?12:6),0);
 const score=Math.max(20,Math.min(maxScore,maxScore-penalties+(publishedWebsite?6:0)+(input.googleBusinessConnected?6:0)));
 return {
  score,
  maxScore,
  summary:openActionable.length?`Your online presence is in good shape, with ${openActionable.length} opportunity${openActionable.length===1?"":"ies"} that could help more local customers find you.`:"Your current website, profile, and review signals look healthy from Servonas' perspective.",
  opportunities:openActionable.length,
  highPriority:openActionable.filter((item)=>item.priority==="high"),
  mediumPriority:openActionable.filter((item)=>item.priority==="medium"),
  healthy:healthyItems,
  recommendations:merged,
 };
}
