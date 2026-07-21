import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {acceptInvitation} from "./actions";
export default async function AcceptInvite({searchParams}:{searchParams:Promise<{token?:string,error?:string}>}){
 const q=await searchParams; if(!q.token)redirect("/app");
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)redirect(`/login?next=${encodeURIComponent(`/invite/accept?token=${q.token}`)}`);
 const {data:invite}=await s.from("business_invitations").select("email,role,expires_at,businesses(name,slug)").eq("token",q.token).maybeSingle();
 return <main className="auth-page"><section className="auth-card"><span className="sv-kicker">Team invitation</span><h1>Join {((invite as any)?.businesses?.name)??"this workspace"}</h1><p>You are signed in as <strong>{user.email}</strong>. Accepting adds you as <strong>{invite?.role??"team member"}</strong>.</p>{q.error&&<p className="auth-error">{q.error}</p>} {!invite?<p className="auth-error">This invitation is invalid, expired, or belongs to another email.</p>:<form action={acceptInvitation}><input type="hidden" name="token" value={q.token}/><button className="sv-button">Accept invitation</button></form>}</section></main>
}
