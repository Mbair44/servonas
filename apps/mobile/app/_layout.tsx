import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";

Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false})});

export default function RootLayout() {
  const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30_000}}}));return <QueryClientProvider client={client}><NotificationNavigation/><Stack screenOptions={{ headerShown:false }}/></QueryClientProvider>;
}
function NotificationNavigation(){const router=useRouter();useEffect(()=>{const open=async(response:Notifications.NotificationResponse)=>{const data=response.notification.request.content.data as {businessId?:unknown;conversationKey?:unknown};if(typeof data.businessId!=="string"||typeof data.conversationKey!=="string"||!/^customer:[0-9a-fA-F-]{36}$/.test(data.conversationKey))return;const {data:session}=await supabase.auth.getSession();if(!session.session){router.replace("/");return;}router.navigate({pathname:"/(office)/messages/[businessId]" as never,params:{businessId:data.businessId,conversationKey:data.conversationKey}} as never);};const subscription=Notifications.addNotificationResponseReceivedListener((response)=>void open(response));void Notifications.getLastNotificationResponseAsync().then((response)=>{if(response)void open(response);});return()=>subscription.remove();},[router]);return null;}
