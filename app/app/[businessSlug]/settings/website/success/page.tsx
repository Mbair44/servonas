import Link from "next/link";
import {redirect} from "next/navigation";
import {requireWorkspace} from "@/lib/workspace";
import {WebsiteIcon} from "@/components/WebsiteIcon";
import {completeWebsiteFirstAndExplore} from "../actions";

export default async function WebsitePublishedSuccessPage({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 const {supabase,business}=await requireWorkspace(businessSlug);
 const [{data:website},{data:onboarding}]=await Promise.all([supabase.from("business_website_settings").select("status,public_slug,custom_domain,domain_status").eq("business_id",business.id).maybeSingle(),supabase.from("business_website_onboarding_states").select("requested_domain,domain_request_status").eq("business_id",business.id).maybeSingle()]);
 if(website?.status!=="published")redirect(`/app/${businessSlug}/settings/website`);
 const origin=(process.env.NEXT_PUBLIC_SITE_URL??"https://servonas.com").replace(/\/$/,"");
 const websiteUrl=website.domain_status==="connected"&&website.custom_domain?`https://${website.custom_domain}`:`${origin}/sites/${website.public_slug}`;
 const pendingDomain=onboarding?.requested_domain&&website.domain_status!=="connected";
 const nextSteps=[
  {title:"Set Up Online Booking",description:"Let customers choose a service and request a time.",href:`/app/${businessSlug}/booking`,icon:"calendar"},
  {title:"Add Services & Pricing",description:"Keep the services shown on your website accurate and ready to book.",href:`/app/${businessSlug}/price-book`,icon:"tools"},
  {title:"Connect Payments",description:"Get ready to accept secure online payments.",href:`/app/${businessSlug}/settings/billing`,icon:"shield"},
  {title:"Set Up Customer Texting",description:"Keep customers updated with business texting.",href:`/app/${businessSlug}/settings/communications#inbound-sms`,icon:"send"},
 ] as const;
 return <main className="website-first-success"><section><div className="website-success-mark"><WebsiteIcon name="check"/></div><span>Website published</span><h1>Your Website Is Ready! 🎉</h1><p>Your Servonas website is live and ready to share with customers.</p><a className="website-success-url" href={websiteUrl} target="_blank" rel="noreferrer">{websiteUrl}<WebsiteIcon name="external"/></a>{pendingDomain&&<aside className="website-success-domain"><strong>Your custom domain</strong><span>{onboarding.requested_domain}</span><small>{onboarding.domain_request_status==="unavailable"?"This domain needs another choice. Servonas will contact you to help select one.":"We're confirming availability and will get it connected for you."}</small></aside>}<div className="website-success-actions"><a className="sv-button" href={websiteUrl} target="_blank" rel="noreferrer"><WebsiteIcon name="eye"/>View My Website</a><form action={completeWebsiteFirstAndExplore.bind(null,businessSlug)}><button className="sv-button sv-secondary" type="submit">Explore Servonas</button></form></div></section><section className="website-success-next"><header><span>What’s next?</span><h2>Now let&apos;s put your website to work.</h2><p>Your website is the front door. Servonas can help you turn new visitors into scheduled, paying customers.</p></header><div>{nextSteps.map(step=><Link href={step.href} key={step.title}><i><WebsiteIcon name={step.icon}/></i><span><strong>{step.title}</strong><small>{step.description}</small></span><b>→</b></Link>)}</div></section></main>;
}
