import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {signOut} from "@/app/auth/actions";
import {inviteTeamMember,revokeInvitation} from "./team/actions";
export default async function Workspace({params,searchParams}:{params:Promise<{businessSlug:string}>,searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams,s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();if(!user)redirect(`/login?next=/app/${businessSlug}`);
 const {data:business,error:businessError}=await s.from("businesses").select("id,name,slug,business_model,email,enabled_modules").eq("slug",businessSlug).maybeSingle();
 if(businessError) throw new Error(`Unable to load workspace: ${businessError.message}`);
 if(!business)notFound();
 const {data:membership,error:membershipError}=await s.from("business_members").select("role").eq("business_id",business.id).eq("user_id",user.id).maybeSingle();
 if(membershipError) throw new Error(`Unable to verify workspace access: ${membershipError.message}`);
 if(!membership)notFound();
 const canManage=["owner","admin"].includes(membership.role);
 const [{data:members},{data:invites}]=await Promise.all([
  s.from("business_members").select("user_id,role,created_at,profiles(email,full_name)").eq("business_id",business.id).order("created_at"),
  canManage?s.from("business_invitations").select("id,email,role,token,expires_at,accepted_at").eq("business_id",business.id).is("accepted_at",null).order("created_at",{ascending:false}):Promise.resolve({data:[] as any[]})
 ]);
 const inviteAction=inviteTeamMember.bind(null,businessSlug),revokeAction=revokeInvitation.bind(null,businessSlug);
 return <main className="sv-workspace"><aside><img src="/servonas-logo-light.svg" alt="Servonas"/><nav><b>Overview</b><span>Bookings</span><span>Calendar</span><span>Inventory</span><span>Customers</span><span>Payments</span><span>Team</span><span>Settings</span></nav><form action={signOut}><button className="workspace-logout">Log out</button></form></aside><section><div className="sv-workspace-head"><div><small>{membership.role} workspace</small><h1>{business.name}</h1></div><Link href="/app">Switch workspace</Link></div>
 {q.created&&<div className="workspace-notice success">Workspace created. You are the owner.</div>}{q.joined&&<div className="workspace-notice success">Invitation accepted. Welcome to the team.</div>}
 <div className="sv-work-metrics"><article><small>Revenue</small><strong>$0</strong><span>Connect Stripe to begin</span></article><article><small>Upcoming bookings</small><strong>0</strong><span>Your calendar is clear</span></article><article><small>Team members</small><strong>{members?.length??0}</strong><span>Manage access below</span></article></div>
 <section className="workspace-panel"><div><span className="sv-kicker">Team</span><h2>People with workspace access</h2></div><div className="team-list">{(members??[]).map((m:any)=><article key={m.user_id}><div><strong>{m.profiles?.full_name||m.profiles?.email||"Team member"}</strong><span>{m.profiles?.email}</span></div><b>{m.role}</b></article>)}</div></section>
 {canManage&&<section className="workspace-panel"><div><span className="sv-kicker">Invite employees</span><h2>Add someone to {business.name}</h2><p>Invitations expire after seven days.</p></div>{q.teamError&&<div className="workspace-notice error">{q.teamError}</div>}{q.teamSuccess&&<div className="workspace-notice success">{q.teamSuccess}</div>}{q.inviteLink&&<div className="invite-link"><code>{q.inviteLink}</code></div>}<form action={inviteAction} className="team-invite-form"><label>Email<input required name="email" type="email" placeholder="employee@company.com"/></label><label>Role<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label><button className="sv-button">Send invitation</button></form>{(invites??[]).length>0&&<div className="pending-invites"><h3>Pending invitations</h3>{(invites??[]).map((i:any)=><article key={i.id}><div><strong>{i.email}</strong><span>{i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</span></div><form action={revokeAction}><input type="hidden" name="invitationId" value={i.id}/><button className="text-button">Revoke</button></form></article>)}</div>}</section>}
 </section></main>
}
