import Link from "next/link";
import {getWebsiteFirstConfig,type WebsiteFirstSource} from "@/lib/websiteFirstConfig";
import {AcquisitionFunnelTracker} from "./AcquisitionFunnelTracker";
import {WebsiteCreationCelebration} from "./WebsiteCreationCelebration";
import {WebsiteFirstLaunchDomainPanel} from "./WebsiteFirstLaunchDomainPanel";
import {WebsiteLaunchPlayground} from "./WebsiteLaunchPlayground";

type PreviewMode="preview"|"domain"|"live";
type DomainChoice="need_domain"|"existing_domain"|"servonas";
type DomainStage="search"|"details"|"registered";
type DomainInfo={configured:boolean;verified:boolean;misconfigured:boolean;error?:string;verification:{type:string;domain:string;value:string;reason?:string}[];dnsRecords:{type:string;name:string;value:string}[]};

type Props={
 businessId:string;
 businessSlug:string;
 source:WebsiteFirstSource;
 celebrate?:boolean;
 celebrationAt?:string;
 mode:PreviewMode;
 domainChoice:DomainChoice;
 domainStage:DomainStage;
 error?:string;
 success?:string;
 domainSuggestions:string[];
 website:{template_key?:string|null;primary_color?:string|null;secondary_color?:string|null;hero_heading?:string|null;hero_subheading?:string|null;public_slug?:string|null;status?:string|null;custom_domain?:string|null;domain_status?:string|null}|null;
 websiteFirst:{domain_preference?:string|null;requested_domain?:string|null;domain_request_status?:string|null}|null;
 domainOrder:{status:string;customer_purchase_price:number|null;customer_renewal_price:number|null;currency:string|null;provider_order_id:string|null;availability_checked_at:string|null;last_error_category:string|null}|null;
 domainInfo:DomainInfo|null;
 business:{name:string;email?:string|null;phone?:string|null;address_line1?:string|null;address_line2?:string|null;city?:string|null;state?:string|null;postal_code?:string|null};
 user:{email?:string;user_metadata?:Record<string,unknown>};
};

export function WebsiteFirstPreview({businessId,businessSlug,source,celebrate=false,celebrationAt,mode,domainChoice,domainStage,error,success,domainSuggestions,website,websiteFirst,domainOrder,domainInfo,business,user}:Props){
 const config=getWebsiteFirstConfig(source)!;
 const previewCelebrationKey=celebrate&&celebrationAt&&mode!=="live"?`${businessId}:preview:${celebrationAt}`:undefined;
 const liveCelebrationKey=mode==="live"&&success?.toLowerCase().includes("your website is live")?`${businessId}:live:${celebrationAt??success}`:undefined;
 const temporaryUrl=`servonas.com/sites/${website?.public_slug??businessSlug}`;
 const liveUrl=website?.domain_status==="connected"&&website.custom_domain?`https://${website.custom_domain}`:`https://${temporaryUrl}`;
 const previewHeader=mode==="live"?"Your website is live. 🎉":"Your website is ready! 🎉";
 const previewBody=mode==="live"
  ?"Your website is live. Click around your site, try different looks, or leave it exactly as it is. You can change anything later."
  :"We've built your website using the information you provided. Take a look around, choose your website address, and launch when you're ready.";

 return <div className="website-first-preview">
  <header><span className="complete">✓ Business</span><i/><span className="complete">✓ Style</span><i/><span>3. Preview / Launch</span></header>
  <section>
   <AcquisitionFunnelTracker industry={source} event="website_preview_viewed"/>
   <span className="sv-kicker">{mode==="live"?"You did it":"Your website is ready to launch"}</span>
   <h1>{previewHeader}</h1>
   <p>{previewBody}</p>
   {error&&<p className="auth-error">{error}</p>}
   {success&&<p className="workspace-notice success">{success}</p>}

   {mode!=="live"&&<>
    <div className="website-first-preview-stage">
     <WebsiteCreationCelebration source={source} businessId={businessId} businessSlug={businessSlug} celebrationKey={previewCelebrationKey}/>
     <div className="website-first-preview-frame"><iframe src={`/app/${businessSlug}/settings/website/preview`} title={`Your ${config.industryLabel} website preview`}/></div>
    </div>
    <div className="website-first-preview-links"><Link href={`/app/${businessSlug}/settings/website/preview`} target="_blank">View full-screen preview</Link><span>Temporary website address: <b>{temporaryUrl}</b></span></div>
    <WebsiteFirstLaunchDomainPanel businessSlug={businessSlug} businessSlugDisplay={website?.public_slug??businessSlug} business={business} user={user} managedDomainRequest={websiteFirst?.domain_preference==="need_domain"} requestedDomain={websiteFirst?.requested_domain??""} domainStatus={websiteFirst?.domain_request_status??"availability_check_needed"} domainOrder={domainOrder} customDomain={website?.custom_domain??""} customDomainStatus={website?.domain_status??"not_connected"} domainInfo={domainInfo} websitePublished={website?.status==="published"} domainChoice={domainChoice} domainStage={domainStage} domainSuggestions={domainSuggestions} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined}/>
    <p className="website-first-preview-help">Want to make changes first? <Link href={`/app/${businessSlug}/settings/website`}>Customize website</Link></p>
   </>}

   {mode==="live"&&<>
    <WebsiteCreationCelebration source={source} businessId={businessId} businessSlug={businessSlug} celebrationKey={liveCelebrationKey}/>
    <div className="website-first-live-actions"><a className="sv-button" href={liveUrl} target="_blank" rel="noreferrer">View My Website</a><Link className="sv-button sv-secondary" href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=preview&domainChoice=${websiteFirst?.domain_preference==="existing_domain"?"existing_domain":"need_domain"}&domainStage=${website?.custom_domain||websiteFirst?.requested_domain?"registered":"search"}`}>{website?.custom_domain||websiteFirst?.requested_domain?"Finish domain setup":"Get a custom domain"}</Link><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/settings/website`}>Customize Website</Link></div>
    <WebsiteLaunchPlayground businessSlug={businessSlug} initialTemplate={website?.template_key??"modern"} initialPrimary={website?.primary_color??"#1769f5"} initialSecondary={website?.secondary_color??"#0b1733"} initialHeading={website?.hero_heading??""} initialSubheading={website?.hero_subheading??""}/>
   </>}
  </section>
 </div>;
}
