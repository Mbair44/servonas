import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { signOut } from "@/app/auth/actions";

export default async function Workspace({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params; const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser(); if(!user) redirect(`/login?next=/app/${businessSlug}`);
 const {data:business}=await s.from("businesses").select("id,name,slug,business_model").eq("slug",businessSlug).maybeSingle(); if(!business) notFound();
 const {data:membership}=await s.from("business_members").select("role").eq("business_id",business.id).eq("user_id",user.id).maybeSingle(); if(!membership) notFound();
 return <main className="sv-workspace"><aside><img src="/servonas-logo-light.svg" alt="Servonas"/><nav><b>Overview</b><span>Bookings</span><span>Calendar</span><span>Inventory</span><span>Customers</span><span>Payments</span><span>Settings</span></nav><form action={signOut}><button className="workspace-logout">Log out</button></form></aside><section><div className="sv-workspace-head"><div><small>{membership.role} workspace</small><h1>{business.name}</h1></div><Link href="/app">Switch workspace</Link></div><div className="sv-work-metrics"><article><small>Revenue</small><strong>$0</strong><span>Connect Stripe to begin</span></article><article><small>Upcoming bookings</small><strong>0</strong><span>Your calendar is clear</span></article><article><small>Customers</small><strong>0</strong><span>Ready for your first lead</span></article></div><div className="sv-empty"><h2>Your secure workspace is ready.</h2><p>This page is server-protected and requires an active membership for {business.name}. The next epic creates businesses automatically during onboarding and adds team invitations.</p></div></section></main>
}
