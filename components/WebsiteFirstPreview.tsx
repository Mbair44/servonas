import Link from "next/link";
import {setWebsitePublished} from "@/app/app/[businessSlug]/settings/website/actions";
import {getWebsiteFirstConfig,type WebsiteFirstSource} from "@/lib/websiteFirstConfig";
import {AcquisitionFunnelTracker} from "./AcquisitionFunnelTracker";
import {WebsiteCreationCelebration} from "./WebsiteCreationCelebration";
import {WebsiteFirstLaunchDomainPanel} from "./WebsiteFirstLaunchDomainPanel";
import {WebsiteLaunchPlayground} from "./WebsiteLaunchPlayground";

type PreviewMode="preview"|"domain"|"live";
type DomainChoice="need_domain"|"existing_domain"|"servonas";

type Props={
 businessId:string;
 businessSlug:string;
 source:WebsiteFirstSource;
 celebrate?:boolean;
 celebrationAt?:string;
 mode:PreviewMode;
 domainChoice:DomainChoice;
 error?:string;
 success?:string;
 website:{template_key?:string|null;primary_color?:string|null;secondary_color?:string|null;hero_heading?:string|null;hero_subheading?:string|null;public_slug?:string|null;status?:string|null;custom_domain?:string|null;domain_status?:string|null}|null;
 websiteFirst:{domain_preference?:string|null;requested_domain?:string|null;domain_request_status?:string|null}|null;
 domainOrder:{status:string;customer_purchase_price:number|null;customer_renewal_price:number|null;currency:string|null;provider_order_id:string|null;availability_checked_at:string|null;last_error_category:string|null}|null;
 business:{name:string;email?:string|null;phone?:string|null;address_line1?:string|null;address_line2?:string|null;city?:string|null;state?:string|null;postal_code?:string|null};
 user:{email?:string;user_metadata?:Record<string,unknown>};
};

export function WebsiteFirstPreview({businessId,businessSlug,source,celebrate=false,celebrationAt,mode,domainChoice,error,success,website,websiteFirst,domainOrder,business,user}:Props){
 const config=getWebsiteFirstConfig(source)!;
 const celebrationKey=celebrate&&celebrationAt?`${businessId}:${celebrationAt}`:undefined;
 const domainCandidate=`${businessSlug}.com`;
 const temporaryUrl=`servonas.com/sites/${website?.public_slug??businessSlug}`;
 const liveUrl=website?.domain_status==="connected"&&website.custom_domain?`https://${website.custom_domain}`:`https://${temporaryUrl}`;
 const previewHeader=mode==="live"?"Your website is live. 🎉":mode==="domain"?"Choose your website address":"Your website is ready! 🎉";
 const previewBody=mode==="live"
  ?"Your website is live. Click around, try a different look, and enjoy the result before you decide whether to go deeper into advanced setup."
  :mode==="domain"
   ?"Keep your launch momentum going. Choose the website address path that fits you best without leaving this 3-step flow."
   :"We&apos;ve built your website using the information you provided. Take a look around. You can publish it now, choose your domain, or customize it later.";

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
     <WebsiteCreationCelebration source={source} businessId={businessId} businessSlug={businessSlug} celebrationKey={celebrationKey}/>
     <div className="website-first-preview-frame"><iframe src={`/app/${businessSlug}/settings/website/preview`} title={`Your ${config.industryLabel} website preview`}/></div>
    </div>
    <div className="website-first-preview-links"><Link href={`/app/${businessSlug}/settings/website/preview`} target="_blank">View full-screen preview</Link><span>Temporary website address: <b>{temporaryUrl}</b></span></div>
   </>}

   {mode==="preview"&&<>
    <article className="website-first-domain-offer"><div><span>Included in Step 3</span><strong>Get your own .com free for your first year.</strong><p><b>{websiteFirst?.requested_domain??domainCandidate}</b> <em>Suggested domain</em></p><small>Choose a new .com, connect one you already own, or keep your Servonas address for now.</small></div><Link className="sv-button sv-secondary" href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=need_domain`}>Get My Free .com →</Link></article>
    <div className="website-first-preview-actions">
     <form action={setWebsitePublished.bind(null,businessSlug)}><input type="hidden" name="publish" value="true"/><input type="hidden" name="returnFlow" value="website_first"/><button className="sv-button" type="submit">Publish My Website - Free</button><small>No credit card required • Edit anytime</small></form>
     <Link className="sv-button sv-secondary" href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=need_domain`}>Get a custom domain</Link>
     <Link className="sv-button sv-secondary" href={`/app/${businessSlug}/settings/website`}>Customize My Website</Link>
    </div>
    <aside><strong>Keep the launch fast</strong><span>Publish first and go live right away</span><span>Choose your domain without entering the advanced editor</span><span>Open the full 7-step editor only when you want deeper setup</span></aside>
   </>}

   {mode==="domain"&&<WebsiteFirstLaunchDomainPanel businessSlug={businessSlug} business={business} user={user} managedDomainRequest={websiteFirst?.domain_preference==="need_domain"} requestedDomain={websiteFirst?.requested_domain??""} domainStatus={websiteFirst?.domain_request_status??"availability_check_needed"} domainOrder={domainOrder} customDomain={website?.custom_domain??""} customDomainStatus={website?.domain_status??"not_connected"} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined} domainChoice={domainChoice}/>}

   {mode==="live"&&<>
    <div className="website-first-live-actions"><a className="sv-button" href={liveUrl} target="_blank" rel="noreferrer">View My Website</a><Link className="sv-button sv-secondary" href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=${websiteFirst?.domain_preference==="existing_domain"?"existing_domain":"need_domain"}`}>{website?.custom_domain||websiteFirst?.requested_domain?"Finish domain setup":"Get a custom domain"}</Link><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/settings/website`}>Improve Your Website</Link></div>
    <WebsiteLaunchPlayground businessSlug={businessSlug} initialTemplate={website?.template_key??"modern"} initialPrimary={website?.primary_color??"#1769f5"} initialSecondary={website?.secondary_color??"#0b1733"} initialHeading={website?.hero_heading??""} initialSubheading={website?.hero_subheading??""}/>
   </>}
  </section>
 </div>;
}
