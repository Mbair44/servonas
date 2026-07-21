"use server";
import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const val=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function inviteTeamMember(businessSlug:string,formData:FormData){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user) redirect(`/login?next=/app/${businessSlug}`);
 const {data:business}=await s.from("businesses").select("id,name").eq("slug",businessSlug).maybeSingle();
 if(!business) redirect("/app");
 const {data:membership}=await s.from("business_members").select("role").eq("business_id",business.id).eq("user_id",user.id).maybeSingle();
 if(!membership||!["owner","admin"].includes(membership.role)) redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("Only owners and admins can invite team members.")}`);
 const email=val(formData,"email").toLowerCase(),role=val(formData,"role");
 if(!email.includes("@")||!["admin","manager","staff"].includes(role)) redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("Enter a valid email and role.")}`);
 const {data:invite,error}=await s.from("business_invitations").upsert({business_id:business.id,email,role,invited_by:user.id,accepted_at:null,accepted_by:null,expires_at:new Date(Date.now()+7*86400000).toISOString()},{onConflict:"business_id,email"}).select("token").single();
 if(error) redirect(`/app/${businessSlug}?teamError=${encodeURIComponent(error.message)}`);
 const origin=(await headers()).get("origin")??process.env.NEXT_PUBLIC_SITE_URL??"http://localhost:3000";
 const next=`/invite/accept?token=${invite.token}`;
 const admin=getSupabaseAdmin();
 let delivery="Invitation created. Copy the invite link below if email delivery is not configured.";
 if(admin){
   const {error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${origin}/auth/callback?next=${encodeURIComponent(next)}`,data:{business_name:business.name}});
   if(!inviteError) delivery=`Invitation email sent to ${email}.`;
   else if(!inviteError?.message.toLowerCase().includes("already")) delivery=`Invitation saved. Email provider response: ${inviteError.message}`;
 }
 revalidatePath(`/app/${businessSlug}`);
 redirect(`/app/${businessSlug}?teamSuccess=${encodeURIComponent(delivery)}&inviteLink=${encodeURIComponent(`${origin}${next}`)}`);
}

export async function revokeInvitation(businessSlug:string,formData:FormData){
 const s=await createSupabaseServerClient(); const id=val(formData,"invitationId");
 const {data:{user}}=await s.auth.getUser(); if(!user)redirect("/login");
 const {data:business}=await s.from("businesses").select("id").eq("slug",businessSlug).maybeSingle(); if(!business)redirect("/app");
 const {data:m}=await s.from("business_members").select("role").eq("business_id",business.id).eq("user_id",user.id).maybeSingle();
 if(!m||!["owner","admin"].includes(m.role))redirect(`/app/${businessSlug}`);
 await s.from("business_invitations").delete().eq("id",id).eq("business_id",business.id);
 revalidatePath(`/app/${businessSlug}`); redirect(`/app/${businessSlug}?teamSuccess=${encodeURIComponent("Invitation revoked.")}`);
}
