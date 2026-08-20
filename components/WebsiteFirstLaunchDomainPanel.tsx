import {checkManagedDomainAvailability,connectWebsiteDomain,completeWebsiteFirstLaunch,saveWebsiteFirstManagedDomainChoice} from "@/app/app/[businessSlug]/settings/website/actions";
import {ManagedDomainCustomerSetup} from "./ManagedDomainCustomerSetup";

type Order={status:string;customer_purchase_price:number|null;customer_renewal_price:number|null;currency:string|null;provider_order_id:string|null;availability_checked_at:string|null;last_error_category:string|null}|null;

const money=(value:number|null,currency="USD")=>value==null?"Unavailable":new Intl.NumberFormat("en-US",{style:"currency",currency}).format(Number(value));

export function WebsiteFirstLaunchDomainPanel({businessSlug,business,user,managedDomainRequest,requestedDomain,domainStatus,domainOrder,customDomain,customDomainStatus,googleMapsApiKey,domainChoice}:{businessSlug:string;business:{name:string;email?:string|null;phone?:string|null;address_line1?:string|null;address_line2?:string|null;city?:string|null;state?:string|null;postal_code?:string|null};user:{email?:string|null;user_metadata?:Record<string,unknown>};managedDomainRequest:boolean;requestedDomain:string;domainStatus:string;domainOrder:Order;customDomain:string;customDomainStatus:string;googleMapsApiKey?:string;domainChoice:"need_domain"|"existing_domain"|"servonas"}) {
 const activeManagedDomain=managedDomainRequest&&requestedDomain?requestedDomain:"";
 const domainAvailable=domainStatus==="available"&&Boolean(domainOrder);
 const domainRenewalVisible=domainAvailable&&domainOrder?.customer_renewal_price!=null;
 const needsAvailability=Boolean(activeManagedDomain)&&!domainAvailable&&!["registration_pending","registered","connected","premium_review","unavailable","failed"].includes(domainStatus);
 return <section className="website-first-domain-panel">
  <header>
   <span className="sv-kicker">Choose your website address</span>
   <h2>Choose your website address</h2>
   <p>Get a new .com free for your first year, connect a domain you already own, or launch with your Servonas address.</p>
  </header>

  <div className="website-first-domain-choices">
   <a className={domainChoice==="need_domain"?"active recommended":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=need_domain`}>
    <span>Recommended</span>
    <strong>Get a new .com</strong>
    <small>Give your business a professional website address. Your first year is included with Servonas.</small>
   </a>
   <a className={domainChoice==="existing_domain"?"active":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=existing_domain`}>
    <strong>I already own a domain</strong>
    <small>Connect a domain you purchased from another provider.</small>
   </a>
   <a className={domainChoice==="servonas"?"active subtle":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=servonas`}>
    <strong>Keep my Servonas address</strong>
    <small>Publish now with your free Servonas address. You can add a custom domain anytime.</small>
   </a>
  </div>

  {domainChoice==="need_domain"&&<div className="website-first-domain-flow">
   {!activeManagedDomain&&<form className="website-first-domain-entry" action={saveWebsiteFirstManagedDomainChoice.bind(null,businessSlug)}>
    <input type="hidden" name="returnFlow" value="website_first"/>
    <label>Find your .com<input required name="domainName" placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off"/></label>
    <button className="sv-button" type="submit">Check Availability →</button>
   </form>}

   {activeManagedDomain&&!domainAvailable&&needsAvailability&&<form className="website-first-domain-status" action={checkManagedDomainAvailability.bind(null,businessSlug)}>
    <div>
     <span>Find your .com</span>
     <strong>{activeManagedDomain}</strong>
     <p>Check whether this domain is available before continuing.</p>
    </div>
    <button className="sv-button" type="submit">Check Availability →</button>
   </form>}

   {domainAvailable&&domainOrder&&domainRenewalVisible&&<div className="website-first-domain-status available">
    <div>
     <span>Available</span>
     <strong>{activeManagedDomain} is available!</strong>
     <p>We&apos;ll register this domain for your business and connect it to your Servonas website.</p>
    </div>
    <dl>
      <div><dt>Due today</dt><dd>$0</dd></div>
      <div><dt>First year</dt><dd>Included with Servonas</dd></div>
      <div><dt>Renewal estimate</dt><dd>{money(domainOrder.customer_renewal_price,domainOrder.currency??"USD")}/year</dd></div>
    </dl>
    <small>No charge today. Review and confirm registration details before final registration.</small>
   </div>}

   {domainAvailable&&domainOrder&&!domainRenewalVisible&&<div className="website-first-domain-status error">
    <div>
     <span>Pricing unavailable</span>
     <strong>{activeManagedDomain} is available.</strong>
     <p>Renewal pricing is temporarily unavailable. Please try again before continuing.</p>
    </div>
   </div>}

   {activeManagedDomain&&<div className="website-first-domain-registrant">
    <ManagedDomainCustomerSetup businessSlug={businessSlug} domain={activeManagedDomain} status={domainStatus} order={domainOrder} editable business={business} user={user} googleMapsApiKey={googleMapsApiKey}/>
   </div>}
  </div>}

  {domainChoice==="existing_domain"&&<form className="website-first-domain-entry" action={connectWebsiteDomain.bind(null,businessSlug)}>
   <input type="hidden" name="returnFlow" value="website_first"/>
   <label>Connect your domain<input required name="customDomain" defaultValue={customDomain} placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off"/></label>
   <button className="sv-button" type="submit">Connect Domain →</button>
   <small>{customDomainStatus==="connected"?"Your domain is already connected.":"Add DNS records after saving, then return here and check the connection."}</small>
  </form>}

  {domainChoice==="servonas"&&<form className="website-first-servonas-choice" action={completeWebsiteFirstLaunch.bind(null,businessSlug)}>
   <input type="hidden" name="choice" value="servonas_url"/>
   <span>You&apos;re ready to launch</span>
   <strong>servonas.com/sites/{businessSlug}</strong>
   <small>You can switch to your own .com anytime.</small>
   <button className="sv-button" type="submit">Publish My Website - Free</button>
  </form>}
 </section>;
}
