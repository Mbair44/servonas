"use client";

import Link from "next/link";
import {usePathname,useSearchParams} from "next/navigation";
import {websiteFirstSources,type WebsiteFirstSource} from "@/lib/websiteFirstConfig";

const attributionKeys=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid","gad_source","gad_campaignid"] as const;
const websiteFirstPaths=new Map<string,WebsiteFirstSource>(websiteFirstSources.map(source=>[`/${source}`,source]));

export function HeaderSignupLink(){
 const pathname=usePathname(),searchParams=useSearchParams();
 const source=pathname?websiteFirstPaths.get(pathname):undefined;
 if(!source)return <Link className="sv-button sv-small" href="/signup">Start Free</Link>;
 const query=new URLSearchParams({source});
 for(const key of attributionKeys){
  const value=searchParams.get(key);
  if(value)query.set(key,value.slice(0,500));
 }
 return <Link className="sv-button sv-small" href={`/onboarding?${query.toString()}`}>Start Free</Link>;
}
