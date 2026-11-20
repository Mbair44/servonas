import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const baseUrl=process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/,"");
export type NotificationRegistration={kind:"registered"}|{kind:"denied"|"unsupported"|"unavailable";message:string};
async function api(businessId:string,method:"POST"|"DELETE",expoPushToken?:string){
 if(!baseUrl)throw new Error("Mobile API URL is not configured.");
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error("Your session has expired.");
 const response=await fetch(`${baseUrl}/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/devices`,{method,headers:{Authorization:`Bearer ${session.access_token}`,"content-type":"application/json"},body:JSON.stringify(expoPushToken?{expoPushToken}:{})});
 if(!response.ok)throw new Error("Notification registration could not be updated.");
}
export async function enableIncomingMessageNotifications(businessId:string):Promise<NotificationRegistration>{
 if(Platform.OS!=="ios"&&Platform.OS!=="android")return {kind:"unsupported",message:"Notifications are not available on this device."};
 // Expo Go is deliberately not presented as production-push capable. Use a
 // development build or TestFlight build with an EAS project identifier.
 if(Constants.executionEnvironment==="storeClient")return {kind:"unsupported",message:"Use a Servonas development build or TestFlight to enable push notifications."};
 const current=await Notifications.getPermissionsAsync();
 const permission=current.granted?current:await Notifications.requestPermissionsAsync();
 if(!permission.granted)return {kind:"denied",message:"Notification permission was not granted."};
 const projectId=Constants.easConfig?.projectId??process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
 if(!projectId)return {kind:"unavailable",message:"Push credentials are not configured for this build."};
 try{const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;await api(businessId,"POST",token);return {kind:"registered"};}
 catch{return {kind:"unavailable",message:"This device could not be registered for notifications."};}
}
export async function deactivateIncomingMessageNotifications(businessIds:string[]){
 await Promise.allSettled(businessIds.map((businessId)=>api(businessId,"DELETE")));
}
export function watchIncomingMessagePushToken(businessId:string){
 return Notifications.addPushTokenListener((token)=>{void api(businessId,"POST",token.data).catch(()=>undefined);});
}
