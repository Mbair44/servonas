import Link from "next/link";

type Summary={employeeCount:number;nonOwnerCount:number;activeCount:number;missingEmailCount:number;pendingInvitationCount:number;ownerOnly:boolean};

export function TeamSetupLanding({businessSlug,summary,canEdit}:{businessSlug:string;summary:Summary;canEdit:boolean}){
 const base=`/app/${businessSlug}/team`;
 return <section className="team-setup" aria-labelledby="team-setup-title">
  <div className="team-setup-heading"><div><span className="sv-kicker">Team setup</span><h2 id="team-setup-title">Add your team to Servonas</h2><p>You can enter employees one at a time or upload a spreadsheet. Employees can be invited to sign in after their information is reviewed.</p></div><Link href={`${base}/imports`} className="team-history-link">Previous imports →</Link></div>
  <div className="team-setup-metrics" aria-label="Team activation summary"><article><span>Employees</span><strong>{summary.employeeCount}</strong><small>{summary.activeCount} active</small></article><article><span>Pending invitations</span><strong>{summary.pendingInvitationCount}</strong><small>{summary.pendingInvitationCount?"Waiting for acceptance":"No invitations waiting"}</small></article><article><span>Missing email</span><strong>{summary.missingEmailCount}</strong><small>{summary.missingEmailCount?"Can be added later":"Team contact is ready"}</small></article></div>
  {summary.ownerOnly&&<div className="team-setup-empty"><span aria-hidden="true">✦</span><div><strong>Your employee directory is ready.</strong><p>Add one or two people manually, or use a spreadsheet when you have a larger team. Adding an employee does not automatically give them login access.</p></div></div>}
  <div className="team-setup-choices">
   <article><span className="team-choice-number" aria-hidden="true">1</span><div><h3>Add employee</h3><p>Best for one or two people. Only a preferred name is required, and advanced workforce settings can wait.</p><ul><li>Create the employee record first</li><li>Choose workforce roles separately</li><li>Invite them only when you are ready</li></ul></div>{canEdit?<a className="sv-button" href="#add-employee">Add employee</a>:<span className="team-choice-restricted">Owner or administrator access required</span>}</article>
   <article><span className="team-choice-number" aria-hidden="true">2</span><div><h3>Import employees</h3><p>Best for a spreadsheet or a larger team. Servonas will preview and check every row before anything is imported.</p><ul><li>Nothing is imported before review</li><li>Existing employees are not overwritten automatically</li><li>Invitations are never sent automatically</li></ul></div><Link className="sv-button sv-secondary" href={`${base}/imports`}>Import employees</Link></article>
  </div>
  <aside className="team-access-explainer"><strong>Employee record versus login access</strong><p>An employee record stores who works in your business. Login access is separate and is granted only through an invitation with an approved workspace role.</p></aside>
 </section>;
}
