export type ExpoPushResult={kind:"accepted"}|{kind:"invalid_token"}|{kind:"temporary"}|{kind:"uncertain"};
type FetchLike=typeof fetch;
export async function sendExpoIncomingMessagePush(input:{token:string;businessId:string;messageId:string;conversationKey:string|null;title:string},request:FetchLike=fetch):Promise<ExpoPushResult>{
 if(!/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(input.token))return {kind:"invalid_token"};
 let response:Response;try{response=await request("https://exp.host/--/api/v2/push/send",{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({to:input.token,title:input.title,body:"New customer text message",sound:"default",data:{businessId:input.businessId,messageId:input.messageId,conversationKey:input.conversationKey}})});}catch{return {kind:"uncertain"};}
 if(response.status>=500||response.status===429)return {kind:"temporary"};
 if(!response.ok)return {kind:"uncertain"};
 const body=await response.json().catch(()=>null) as {data?:{status?:string;details?:{error?:string}}[]}|null;
 const result=body?.data?.[0];
 if(result?.status==="ok")return {kind:"accepted"};
 if(result?.details?.error==="DeviceNotRegistered"||result?.details?.error==="InvalidCredentials")return {kind:"invalid_token"};
 return {kind:"temporary"};
}
