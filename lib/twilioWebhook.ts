import twilio from "twilio";

/** Converts form data without losing repeated keys; the Twilio SDK sorts array
 * values exactly as its webhook-signing implementation requires. */
export function twilioPostParams(params:URLSearchParams):Record<string,string|string[]>{
 const result:Record<string,string|string[]>={};
 for(const [key,value] of params){const prior=result[key];result[key]=prior===undefined?value:Array.isArray(prior)?[...prior,value]:[prior,value];}
 return result;
}

export function validTwilioSignature(url:string,params:URLSearchParams,signature:string,token:string){
 return twilio.validateRequest(token,signature,url,twilioPostParams(params));
}

export function twilioWebhookUrl(request:Request,environmentName:string){return process.env[environmentName]?.trim()||request.url;}
