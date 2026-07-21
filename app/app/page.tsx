import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { signOut } from "@/app/auth/actions";

export default async function AppHome(){
  const s=await createSupabaseServerClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect("/login");
  const {data:memberships}=await s.from("business_members").select("role,businesses(id,name,slug)").eq("user_id",user.id);
  const workspaces=(memberships??[]).map((m:any)=>({...m.businesses,role:m.role})).filter(Boolean);
  if(workspaces.length===1) redirect(`/app/${workspaces[0].slug}`);
  return <main className="app-home"><section className="app-home-card"><div className="app-home-head"><div><span className="sv-kicker">Servonas</span><h1>Your workspaces</h1><p>Signed in as {user.email}</p></div><form action={signOut}><button className="sv-button sv-secondary">Log out</button></form></div>{workspaces.length?<div className="workspace-list">{workspaces.map((w:any)=><Link key={w.id} href={`/app/${w.slug}`}><strong>{w.name}</strong><span>{w.role}</span></Link>)}</div>:<div className="sv-empty"><h2>Create your first business</h2><p>Your account is ready. Continue through onboarding to create a workspace and become its owner.</p><Link className="sv-button" href="/onboarding">Create your business</Link></div>}</section></main>
}
