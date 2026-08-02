import {createHmac,timingSafeEqual} from "node:crypto";

export function validTwilioSignature(url:string,params:URLSearchParams,signature:string,token:string){
 const payload=url+[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>key+value).join("");
 const expected=createHmac("sha1",token).update(payload).digest("base64");
 const left=Buffer.from(expected),right=Buffer.from(signature);
 return left.length===right.length&&timingSafeEqual(left,right);
}

export function twilioWebhookUrl(request:Request,environmentName:string){return process.env[environmentName]?.trim()||request.url;}
