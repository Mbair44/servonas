export const ANALYTICS_CONSENT_KEY="servonas.analytics_consent";

export function isServonasAnalyticsHost(hostname:string){
 const host=hostname.trim().toLowerCase();
 return host==="servonas.com"||host==="www.servonas.com"||host==="localhost"||host==="127.0.0.1"||host.endsWith(".vercel.app");
}

export function isPublicAnalyticsConsentPath(pathname:string){
 return !pathname.startsWith("/app")&&!pathname.startsWith("/tech")&&!pathname.startsWith("/sites/preview");
}
