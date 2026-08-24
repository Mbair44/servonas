import {changeManagedDomainRequest,checkManagedDomainAvailability,checkWebsiteDomain,completeWebsiteFirstLaunch,connectWebsiteDomain,saveWebsiteFirstManagedDomainChoice} from "@/app/app/[businessSlug]/settings/website/actions";
import {AutoSubmitManagedDomainAvailability} from "./AutoSubmitManagedDomainAvailability";
import {DomainAvailabilitySubmit} from "./DomainAvailabilitySubmit";
import {ManagedDomainCustomerSetup} from "./ManagedDomainCustomerSetup";
import {PublishCelebrationSubmit} from "./PublishCelebrationSubmit";

type Order={status:string;customer_purchase_price:number|null;customer_renewal_price:number|null;currency:string|null;provider_order_id:string|null;availability_checked_at:string|null;last_error_category:string|null}|null;
type DomainInfo={configured:boolean;verified:boolean;misconfigured:boolean;error?:string;verification:{type:string;domain:string;value:string;reason?:string}[];dnsRecords:{type:string;name:string;value:string}[]}|null;
type DomainStage="search"|"details"|"registered";

const money=(value:number|null,currency="USD")=>value==null?"Unavailable":new Intl.NumberFormat("en-US",{style:"currency",currency}).format(Number(value));

export function WebsiteFirstLaunchDomainPanel({businessSlug,businessSlugDisplay,business,user,managedDomainRequest,requestedDomain,domainStatus,domainOrder,customDomain,customDomainStatus,domainInfo,websitePublished,googleMapsApiKey,domainChoice,domainStage,domainSuggestions}:{businessSlug:string;businessSlugDisplay:string;business:{name:string;email?:string|null;phone?:string|null;address_line1?:string|null;address_line2?:string|null;city?:string|null;state?:string|null;postal_code?:string|null};user:{email?:string|null;user_metadata?:Record<string,unknown>};managedDomainRequest:boolean;requestedDomain:string;domainStatus:string;domainOrder:Order;customDomain:string;customDomainStatus:string;domainInfo:DomainInfo;websitePublished:boolean;googleMapsApiKey?:string;domainChoice:"need_domain"|"existing_domain"|"servonas";domainStage:DomainStage;domainSuggestions:string[]}) {
 const activeManagedDomain=managedDomainRequest&&requestedDomain?requestedDomain:"";
 const domainAvailable=domainStatus==="available"&&Boolean(domainOrder);
 const showRegistrationDetails=domainAvailable&&Boolean(domainOrder?.customer_renewal_price!=null)&&(domainStage==="details"||domainStage==="search");
 const connectionStatus=["registration_pending","registered","connected"].includes(domainStatus);
 const renewalVisible=domainAvailable&&domainOrder?.customer_renewal_price!=null;
 const pathQuery=`business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=preview&domainChoice=need_domain`;
 return <section className="website-first-domain-panel">
  <header>
   <span className="sv-kicker">Choose your website address</span>
   <h2>Choose your website address</h2>
   <p>Get a new .com free for your first year, connect a domain you already own, or launch with your Servonas address.</p>
  </header>

  <div className="website-first-domain-choices">
   <a className={domainChoice==="need_domain"?"active recommended":""} href={`/onboarding?${pathQuery}&domainStage=${domainAvailable?"details":"search"}`}>
    <span>Recommended</span>
    <strong>Get a new .com</strong>
    <small>Give your business a professional website address. Your first year is included with Servonas.</small>
   </a>
   <a className={domainChoice==="existing_domain"?"active":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=preview&domainChoice=existing_domain&domainStage=search`}>
    <strong>I already own a domain</strong>
    <small>Connect a domain you purchased from another provider.</small>
   </a>
   <a className={domainChoice==="servonas"?"active subtle":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=preview&domainChoice=servonas&domainStage=search`}>
    <strong>Keep my Servonas address</strong>
    <small>Publish with your free Servonas address. You can add a custom domain anytime.</small>
   </a>
  </div>

  {domainChoice==="need_domain"&&<div className="website-first-domain-flow">
   {!activeManagedDomain&&<form className="website-first-domain-entry" action={saveWebsiteFirstManagedDomainChoice.bind(null,businessSlug)}>
    <input type="hidden" name="returnFlow" value="website_first"/>
    <label>Find your .com<input required name="domainName" placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off"/></label>
    <DomainAvailabilitySubmit/>
   </form>}

   {activeManagedDomain&&!domainAvailable&&!connectionStatus&&<form className="website-first-domain-entry" action={checkManagedDomainAvailability.bind(null,businessSlug)} data-auto-check-domain="true">
    <div className="website-first-domain-search-head"><span>Find your .com</span><strong>{activeManagedDomain}</strong></div>
    <input type="hidden" name="returnFlow" value="website_first"/>
    <AutoSubmitManagedDomainAvailability/>
    <DomainAvailabilitySubmit/>
   </form>}

   {activeManagedDomain&&domainStatus==="unavailable"&&Boolean(domainSuggestions.length)&&<div className="website-first-domain-status">
    <div>
     <span>Available alternatives</span>
     <strong>Here are a few domains that should still work.</strong>
     <p>Pick one and we&apos;ll check it right away.</p>
    </div>
    <div className="website-first-domain-suggestions">
     {domainSuggestions.map(suggestion=><form key={suggestion} action={changeManagedDomainRequest.bind(null,businessSlug)}>
      <input type="hidden" name="returnFlow" value="website_first"/>
      <input type="hidden" name="newManagedDomain" value={suggestion}/>
      <button className="sv-button sv-secondary" type="submit">{suggestion}</button>
     </form>)}
    </div>
   </div>}

   {domainAvailable&&!renewalVisible&&<div className="website-first-domain-status error">
    <div>
     <span>Pricing unavailable</span>
     <strong>{activeManagedDomain} is available.</strong>
     <p>We couldn&apos;t retrieve the renewal price. Please try again before registering.</p>
    </div>
    <form action={checkManagedDomainAvailability.bind(null,businessSlug)}><button className="sv-button" type="submit">Retry Pricing</button></form>
   </div>}

   {showRegistrationDetails&&<div className="website-first-domain-registrant"><ManagedDomainCustomerSetup businessSlug={businessSlug} domain={activeManagedDomain} status={domainStatus} order={domainOrder} editable business={business} user={user} googleMapsApiKey={googleMapsApiKey}/></div>}

   {connectionStatus&&<div className="website-first-domain-status connected">
    <div>
     <span>Your domain is yours!</span>
     <strong>{activeManagedDomain}</strong>
     <p>{domainStatus==="connected"?"Your new domain is connected to your Servonas website.":"We&apos;re connecting your new domain to your Servonas website."}</p>
    </div>
    <dl>
     <div><dt>Status</dt><dd>{domainStatus==="registration_pending"?"Connecting":domainStatus==="registered"?"Verification pending":"Connected"}</dd></div>
     <div><dt>Today</dt><dd>$0</dd></div>
     <div><dt>Renews at</dt><dd>{money(domainOrder?.customer_renewal_price??null,domainOrder?.currency??"USD")}/year</dd></div>
    </dl>
    {!websitePublished&&<form action={completeWebsiteFirstLaunch.bind(null,businessSlug)}><input type="hidden" name="choice" value="managed_domain"/><PublishCelebrationSubmit label="Publish My Website — Free →" celebratingLabel="Launching your website…"/></form>}
   </div>}
  </div>}

  {domainChoice==="existing_domain"&&<div className="website-first-domain-flow">
   <form className="website-first-domain-entry" action={connectWebsiteDomain.bind(null,businessSlug)}>
    <input type="hidden" name="returnFlow" value="website_first"/>
    <label>Connect your domain<input required name="customDomain" defaultValue={customDomain} placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off"/></label>
    <button className="sv-button" type="submit">{customDomain?"Continue →":"Connect Domain →"}</button>
   </form>
   {customDomain&&<div className="website-first-domain-existing">
    <div className="website-dns-instructions"><strong>{customDomainStatus==="connected"?"Connected":"Connect your DNS"}</strong>{customDomainStatus==="connected"?<p>{customDomain} is connected and ready to use.</p>:<><p>Add these DNS records wherever your domain is currently managed, then return here and click Check Connection.</p>{domainInfo?.verification.map((record,index)=><div className="website-dns-record" key={`verify-${index}`}><b>{record.type}</b><span><small>Name</small><code>{record.domain}</code></span><span><small>Value</small><code>{record.value}</code></span></div>)}{domainInfo?.dnsRecords.map((record,index)=><div className="website-dns-record" key={`route-${index}`}><b>{record.type}</b><span><small>Name</small><code>{record.name}</code></span><span><small>Value</small><code>{record.value}</code></span></div>)}</>}</div>
    <form className="website-first-domain-existing-actions" action={checkWebsiteDomain.bind(null,businessSlug)}><input type="hidden" name="returnFlow" value="website_first"/><input type="hidden" name="customDomain" value={customDomain}/><input type="hidden" name="publicSlug" value={businessSlugDisplay}/><button className="sv-button sv-secondary" type="submit">Check Connection</button></form>
   </div>}
  </div>}

  {domainChoice==="servonas"&&<form className="website-first-servonas-choice" action={completeWebsiteFirstLaunch.bind(null,businessSlug)}>
   <input type="hidden" name="choice" value="servonas_url"/>
   <span>You&apos;re ready to launch</span>
   <strong>servonas.com/sites/{businessSlugDisplay}</strong>
   <small>You can add your own .com anytime.</small>
   <PublishCelebrationSubmit label="Publish My Website — Free →" celebratingLabel="Launching your website…"/>
  </form>}
 </section>;
}
