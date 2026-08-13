import Link from "next/link";
import {redirect} from "next/navigation";
import {requireWorkspace} from "@/lib/workspace";
import {WebsiteIcon} from "@/components/WebsiteIcon";

export default async function WebsitePublishedSuccessPage({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 const {supabase,business}=await requireWorkspace(businessSlug);
 const {data:website}=await supabase.from("business_website_settings").select("status,public_slug,custom_domain,domain_status").eq("business_id",business.id).maybeSingle();
 if(website?.status!=="published")redirect(`/app/${businessSlug}/settings/website`);
 const origin=(process.env.NEXT_PUBLIC_SITE_URL??"https://servonas.com").replace(/\/$/,"");
 const websiteUrl=website.domain_status==="connected"&&website.custom_domain?`https://${website.custom_domain}`:`${origin}/sites/${website.public_slug}`;
 const nextSteps=[
  {title:"Set up online booking",description:"Let customers choose a service and request a time.",href:`/app/${businessSlug}/booking`,icon:"calendar"},
  {title:"Add services and pricing",description:"Keep the services shown on your website up to date.",href:`/app/${businessSlug}/price-book`,icon:"tools"},
  {title:"Connect payments",description:"Get ready to accept secure online payments.",href:`/app/${businessSlug}/settings/billing`,icon:"shield"},
  {title:"Invite your team",description:"Add the people who help run your business.",href:`/app/${businessSlug}/team`,icon:"store"},
 ] as const;
 return <main className="website-first-success"><section><div className="website-success-mark"><WebsiteIcon name="check"/></div><span>Website published</span><h1>Your Website Is Ready! 🎉</h1><p>Your Servonas website is live and ready to share with customers.</p><a className="website-success-url" href={websiteUrl} target="_blank" rel="noreferrer">{websiteUrl}<WebsiteIcon name="external"/></a><div className="website-success-actions"><a className="sv-button" href={websiteUrl} target="_blank" rel="noreferrer"><WebsiteIcon name="eye"/>View My Website</a><Link className="sv-button sv-secondary" href={`/app/${businessSlug}`}>Go to My Dashboard</Link></div></section><section className="website-success-next"><header><span>What’s next?</span><h2>Now let&apos;s put your website to work.</h2><p>Your website is the front door. Servonas can help you turn new visitors into scheduled, paying customers.</p></header><div>{nextSteps.map(step=><Link href={step.href} key={step.title}><i><WebsiteIcon name={step.icon}/></i><span><strong>{step.title}</strong><small>{step.description}</small></span><b>→</b></Link>)}</div></section></main>;
}
