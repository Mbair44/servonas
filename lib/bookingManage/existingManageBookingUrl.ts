import {bookingManageTokenHash} from "./tokenHash.ts";

const tokenPattern=/\/manage-booking\/([A-Za-z0-9_-]{32,})(?=[?\s"'<]|$)/g;

/**
 * Tokens are deliberately hash-only in the database. A staff page may reopen
 * an active customer URL only when that exact token was already sent and its
 * hash still matches the active booking token. It never creates or rotates one.
 */
export function existingManageBookingUrl(input:{tokenHash:string|null|undefined;expiresAt:string|null|undefined;messageBodies:Array<string|null|undefined>;origin:string;now?:Date}){
 const now=input.now??new Date();
 if(!input.tokenHash||(input.expiresAt&&new Date(input.expiresAt)<=now))return null;
 for(const body of input.messageBodies){
  if(!body)continue;
  for(const match of body.matchAll(tokenPattern)){
   const token=match[1];
   if(token&&bookingManageTokenHash(token)===input.tokenHash)return `${input.origin.replace(/\/$/,"")}/manage-booking/${token}`;
  }
 }
 return null;
}
