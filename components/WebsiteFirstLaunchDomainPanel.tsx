import {checkManagedDomainAvailability,connectWebsiteDomain,purchaseManagedDomain,changeManagedDomainRequest,completeWebsiteFirstLaunch,saveWebsiteFirstManagedDomainChoice} from "@/app/app/[businessSlug]/settings/website/actions";
import {ManagedDomainCustomerSetup} from "./ManagedDomainCustomerSetup";

type Order={status:string;customer_purchase_price:number|null;customer_renewal_price:number|null;currency:string|null;provider_order_id:string|null;availability_checked_at:string|null;last_error_category:string|null}|null;

export function WebsiteFirstLaunchDomainPanel({businessSlug,business,user,managedDomainRequest,requestedDomain,domainStatus,domainOrder,customDomain,customDomainStatus,googleMapsApiKey,domainChoice}:{businessSlug:string;business:{name:string;email?:string|null;phone?:string|null;address_line1?:string|null;address_line2?:string|null;city?:string|null;state?:string|null;postal_code?:string|null};user:{email?:string|null;user_metadata?:Record<string,unknown>};managedDomainRequest:boolean;requestedDomain:string;domainStatus:string;domainOrder:Order;customDomain:string;customDomainStatus:string;googleMapsApiKey?:string;domainChoice:"need_domain"|"existing_domain"|"servonas"}) {
 const activeManagedDomain=managedDomainRequest&&requestedDomain?requestedDomain:"";
 return <section className="website-first-domain-panel">
  <header>
   <span className="sv-kicker">Your website address</span>
   <h2>How would you like customers to find you?</h2>
   <p>Keep this inside your launch flow. You can choose a new .com, connect a domain you already own, or keep your Servonas address for now.</p>
  </header>
  <div className="website-first-domain-choices">
   <a className={domainChoice==="need_domain"?"active":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=need_domain`}><strong>Get a new .com</strong><small>Recommended</small></a>
   <a className={domainChoice==="existing_domain"?"active":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=existing_domain`}><strong>I already own a domain</strong><small>Connect it here</small></a>
   <a className={domainChoice==="servonas"?"active":""} href={`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&websiteMode=domain&domainChoice=servonas`}><strong>Keep my Servonas address</strong><small>Publish now, change later</small></a>
  </div>

  {domainChoice==="need_domain"&&<div className="website-first-domain-flow">
   {!activeManagedDomain?<form className="website-first-domain-entry" action={saveWebsiteFirstManagedDomainChoice.bind(null,businessSlug)}>
    <input type="hidden" name="returnFlow" value="website_first"/>
    <label>Find your .com<input required name="domainName" placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off"/></label>
    <button className="sv-button" type="submit">Save domain choice</button>
   </form>:<form><input type="hidden" name="returnFlow" value="website_first"/><ManagedDomainCustomerSetup businessSlug={businessSlug} domain={activeManagedDomain} status={domainStatus} order={domainOrder} editable business={business} user={user} googleMapsApiKey={googleMapsApiKey}/></form>}
  </div>}

  {domainChoice==="existing_domain"&&<form className="website-first-domain-entry" action={connectWebsiteDomain.bind(null,businessSlug)}>
   <input type="hidden" name="returnFlow" value="website_first"/>
   <label>Enter your existing domain<input required name="customDomain" defaultValue={customDomain} placeholder="www.yourbusiness.com" autoCapitalize="none" autoCorrect="off"/></label>
   <button className="sv-button" type="submit">Save domain and continue</button>
   <small>{customDomainStatus==="connected"?"Your domain is already connected.":"We’ll save it and show connection instructions after launch."}</small>
  </form>}

  {domainChoice==="servonas"&&<form className="website-first-servonas-choice" action={completeWebsiteFirstLaunch.bind(null,businessSlug)}>
   <input type="hidden" name="choice" value="servonas_url"/>
   <button className="sv-button" type="submit">Keep my Servonas address</button>
   <small>You can connect a custom domain later without losing your live website.</small>
  </form>}
 </section>;
}
