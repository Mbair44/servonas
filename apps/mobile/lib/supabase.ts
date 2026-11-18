import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
const url=process.env.EXPO_PUBLIC_SUPABASE_URL,anonKey=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if(!url||!anonKey)throw new Error("Mobile Supabase public configuration is missing.");
const storage={getItem:(key:string)=>SecureStore.getItemAsync(key),setItem:(key:string,value:string)=>SecureStore.setItemAsync(key,value),removeItem:(key:string)=>SecureStore.deleteItemAsync(key)};
export const supabase=createClient(url,anonKey,{auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
