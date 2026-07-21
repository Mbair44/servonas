"use server";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
export async function acceptInvitation(formData:FormData){
 const token=String(formData.get("token")??""); const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser(); if(!user)redirect(`/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`);
 const {data,error}=await s.rpc("accept_business_invitation",{p_token:token});
 if(error)redirect(`/invite/accept?token=${token}&error=${encodeURIComponent(error.message)}`);
 const row=Array.isArray(data)?data[0]:data; redirect(`/app/${row.business_slug}?joined=1`);
}
