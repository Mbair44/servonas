import Link from "next/link";
import {teamActivationNeedsAttention,type TeamActivationCounts} from "@/lib/teamActivation";

export function TeamActivationDashboard({businessSlug,counts,canEdit}:{businessSlug:string;counts:TeamActivationCounts;canEdit:boolean}){
 const metrics=[["Total employees",counts.total],["Active employees",counts.active],["Without email",counts.withoutEmail],["Not invited",counts.notInvited],["Pending",counts.pending],["Accepted",counts.accepted],["Expired",counts.expired],["Failed",counts.failed],["Missing roles",counts.missingRoles]] as const;
 return <section className="workspace-panel team-activation">
  <header><div><span className="sv-kicker">Team activation</span><h2>Get your team ready</h2><p>{teamActivationNeedsAttention(counts)?`${teamActivationNeedsAttention(counts)} setup item${teamActivationNeedsAttention(counts)===1?" needs":"s need"} attention.`:"Your employee setup is in good shape."}</p></div><Link href={`/app/${businessSlug}/team/imports`}>Review imports</Link></header>
  <div className="team-activation-metrics">{metrics.map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
  {canEdit&&<nav aria-label="Team activation actions"><a className="sv-button" href="#invite-employee">Invite employee</a><a className="sv-button sv-secondary" href="#add-employee">Add employee</a><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team/imports`}>Import employees</Link></nav>}
 </section>;
}
