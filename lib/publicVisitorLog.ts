import {createHmac} from "node:crypto";

const clean=(value:string|null,max=500)=>value?.trim().slice(0,max)||null;

export function logPublicRouteVisit(requestHeaders:Headers,route:string,context:Record<string,unknown>={}){
 const forwarded=clean(requestHeaders.get("x-forwarded-for"),300);
 const ip=forwarded?.split(",")[0]?.trim()||clean(requestHeaders.get("x-real-ip"),100);
 const hashSecret=process.env.VISITOR_LOG_HASH_SECRET?.trim()||process.env.PUBLIC_LINK_RATE_LIMIT_SECRET?.trim();
 const visitorId=ip&&hashSecret
  ?createHmac("sha256",hashSecret).update(ip).digest("hex").slice(0,20)
  :null;
 const userAgent=clean(requestHeaders.get("user-agent"));
 console.info("Public route visit",{
  route,
  occurredAt:new Date().toISOString(),
  visitorId,
  visitorHashConfigured:Boolean(hashSecret),
  userAgent,
  likelyBot:Boolean(userAgent&&/bot|crawler|spider|slurp|preview|scanner|headless/i.test(userAgent)),
  referer:clean(requestHeaders.get("referer")),
  host:clean(requestHeaders.get("host"),200),
  requestId:clean(requestHeaders.get("x-vercel-id")||requestHeaders.get("x-request-id"),200),
  country:clean(requestHeaders.get("x-vercel-ip-country"),10),
  region:clean(requestHeaders.get("x-vercel-ip-country-region"),100),
  city:clean(requestHeaders.get("x-vercel-ip-city"),100),
  ...context,
 });
}
