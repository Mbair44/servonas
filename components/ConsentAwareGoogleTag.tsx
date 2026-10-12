"use client";
import {usePathname} from "next/navigation";
import {TenantGoogleAdsTag} from "./TenantGoogleAdsTag";
import {isPlatformGoogleAdsPath} from "@/lib/googleTag";
import {isPublicAnalyticsConsentPath,isServonasAnalyticsHost} from "@/lib/publicAnalytics";

export function ConsentAwareGoogleTag(){
 const pathname=usePathname();
 if(typeof window==="undefined"||!isServonasAnalyticsHost(location.hostname)||!isPublicAnalyticsConsentPath(location.pathname)||!isPlatformGoogleAdsPath(pathname??""))return null;
 return <TenantGoogleAdsTag tagId="AW-18340749438" scope="platform"/>;
}
