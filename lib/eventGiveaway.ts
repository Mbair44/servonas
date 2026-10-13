import {createHash,randomBytes} from "node:crypto";

export const giveawayStatuses=["draft","published","closed","archived"] as const;
export const cleanGiveawaySlug=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
export const normalizeGiveawayEmail=(value:string)=>value.trim().toLowerCase();
export const validGiveawayEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeGiveawayEmail(value));
export const giveawayQrUrl=(origin:string,slug:string,campaign:string|null)=>{
 const url=new URL(`/giveaways/${encodeURIComponent(slug)}`,origin);
 url.searchParams.set("utm_source","offline");url.searchParams.set("utm_medium","qr");url.searchParams.set("utm_campaign",campaign||slug);return url.toString();
};
export const csvCell=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
export const giveawayCsv=(rows:Record<string,unknown>[])=>["First name,Email,Phone,Email marketing consent,SMS marketing consent,Entered at",...rows.map(row=>[row.first_name,row.email,row.phone,row.email_marketing_consent?"Yes":"No",row.sms_marketing_consent?"Yes":"No",row.created_at].map(csvCell).join(","))].join("\n");
export const winnerCommitment=(giveawayId:string,winnerEntryId:string,nonce:string)=>createHash("sha256").update(`${giveawayId}:${winnerEntryId}:${nonce}`).digest("hex");
export const winnerNonce=()=>randomBytes(32).toString("hex");

/** Turnstile stays fail-closed whenever production credentials are configured. */
export async function verifyTurnstile(token:string,remoteIp:string|null,expected:{hostname:string;action:string}){
 const secret=process.env.TURNSTILE_SECRET_KEY?.trim();
 if(!secret)return process.env.NODE_ENV!=="production";
 if(!token)return false;
 try{const body=new URLSearchParams({secret,response:token,...(remoteIp?{remoteip:remoteIp}:{})});const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body,cache:"no-store"});const result=await response.json() as {success?:boolean;hostname?:string;action?:string};return result.success===true&&result.action===expected.action&&result.hostname?.toLowerCase()===expected.hostname.toLowerCase();}catch{return false;}
}
