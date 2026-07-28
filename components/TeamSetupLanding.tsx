import Link from "next/link";

type Summary={
 employeeCount:number;
 activeCount:number;
 missingEmailCount:number;
 pendingInvitationCount:number;
 importIssueCount:number;
 ownerOnly:boolean;
};

type RecentEmployee={
 id:string;
 preferredName:string;
 role:string;
 status:"Active"|"Inactive"|"Pending invitation";
};

export function TeamSetupLanding({
 businessSlug,summary,recentEmployees,canEdit,
}:{businessSlug:string;summary:Summary;recentEmployees:RecentEmployee[];canEdit:boolean}){
 const base=`/app/${businessSlug}/team`;
 const metrics=[
  {label:"Employees",value:summary.employeeCount,detail:`${summary.activeCount} active`,href:`${base}#employee-directory`},
  summary.pendingInvitationCount>0?{label:"Pending invitations",value:summary.pendingInvitationCount,detail:"Waiting",href:`${base}#team-activation`}:null,
  summary.missingEmailCount>0?{label:"Missing emails",value:summary.missingEmailCount,detail:"Need attention",href:`${base}?email=missing#employee-directory`}:null,
  summary.importIssueCount>0?{label:"Import issues",value:summary.importIssueCount,detail:"Need attention",href:`${base}/imports`}:null,
 ].filter((metric):metric is NonNullable<typeof metric>=>metric!==null);

 return <section className="team-setup" aria-labelledby="team-setup-title">
  <div className="team-setup-heading">
   <div><h2 id="team-setup-title">Employees</h2></div>
   <Link href={`${base}/imports`} className="team-history-link">Previous imports →</Link>
  </div>

  <div className="team-setup-metrics" aria-label="Team summary">
   {metrics.map(metric=><Link href={metric.href} key={metric.label} aria-label={`${metric.label}: ${metric.value}. ${metric.detail}`}>
    <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small><b aria-hidden="true">→</b>
   </Link>)}
  </div>

  {summary.ownerOnly&&<div className="team-setup-empty"><span aria-hidden="true">✦</span><div><strong>Let&apos;s build your team.</strong><p>Add employees individually or import your existing team.</p></div></div>}

  <nav className="team-setup-actions" aria-label="Add team members">
   {canEdit?<a href="#add-employee"><span className="team-action-icon" aria-hidden="true">+</span><span><strong>Add employee</strong><small>Add one person manually</small></span><b aria-hidden="true">→</b></a>:null}
   <Link href={`${base}/imports`}><span className="team-action-icon" aria-hidden="true">↥</span><span><strong>Import employees</strong><small>Import from Excel or CSV</small></span><b aria-hidden="true">→</b></Link>
  </nav>

  <section className="team-recent" aria-labelledby="recent-employees-title">
   <header><h3 id="recent-employees-title">Recent employees</h3><a href="#employee-directory">View all employees</a></header>
   {recentEmployees.length?<div className="team-recent-list">{recentEmployees.map(employee=><Link href={`${base}/${employee.id}`} key={employee.id}>
    <span className="team-recent-avatar" aria-hidden="true">{employee.preferredName.slice(0,2).toUpperCase()}</span>
    <span><strong>{employee.preferredName}</strong><small>{employee.role} • {employee.status}</small></span>
    <b aria-hidden="true">→</b>
   </Link>)}</div>:<div className="team-recent-empty"><strong>No employees yet.</strong><p>Your newest team members will appear here.</p></div>}
  </section>
 </section>;
}
