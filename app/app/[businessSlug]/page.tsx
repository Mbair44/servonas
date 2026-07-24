import Link from "next/link";
import { headers } from "next/headers";
import CopyInvitationLink from "@/components/CopyInvitationLink";
import { canManageBusiness } from "@/lib/access";
import { addDays, dateInTimeZone, formatBusinessDateTime, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { calendarDays } from "@/lib/scheduleCalendar";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "./WorkspaceNav";
import {
  disableTechnician,
  enableTechnician,
  inviteTeamMember,
  resendInvitation,
  revokeInvitation,
} from "./team/actions";

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

export default async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const canManage = canManageBusiness(role);
  const today = dateInTimeZone(new Date(), business.timezone);
  const tomorrow = addDays(today, 1);
  const weekDays = calendarDays(today, "week");
  const weekStart = zonedDateTimeToUtc(weekDays[0], "00:00", business.timezone).toISOString();
  const weekEnd = zonedDateTimeToUtc(addDays(weekDays[6], 1), "00:00", business.timezone).toISOString();
  const todayStart = zonedDateTimeToUtc(today, "00:00", business.timezone).toISOString();
  const todayEnd = zonedDateTimeToUtc(tomorrow, "00:00", business.timezone).toISOString();

  const [
    { count: customerCount },
    { data: weekJobs, error: jobsError },
    { data: recentCustomers },
    { data: members },
    { data: technicians },
    { data: activity },
    { data: invites },
    { count: unassignedCount },
    { count: pendingCount },
    { count: inProgressCount },
    { count: completedCount },
    { count: canceledCount },
  ] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_deleted", false),
    supabase.from("jobs")
      .select("id,job_number,title,status,starts_at,assigned_technician_id,booking_source,customers!jobs_customer_tenant_fk(first_name,last_name,company_name)")
      .eq("business_id", business.id).eq("is_deleted", false)
      .gte("starts_at", weekStart).lt("starts_at", weekEnd).order("starts_at"),
    supabase.from("customers").select("id,first_name,last_name,company_name,created_at")
      .eq("business_id", business.id).eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(5),
    supabase.from("business_members")
      .select("user_id,role,created_at,profiles!business_members_user_profile_fk(email,full_name)")
      .eq("business_id", business.id).order("created_at"),
    supabase.from("technician_profiles")
      .select("id,member_user_id,is_active,is_technician,can_be_assigned_jobs")
      .eq("business_id", business.id),
    supabase.from("business_activity").select("id,summary,created_at")
      .eq("business_id", business.id).order("created_at", { ascending: false }).limit(8),
    canManage
      ? supabase.from("business_invitations").select("id,email,role,token,expires_at")
          .eq("business_id", business.id).is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; role: string; token: string; expires_at: string }> }),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_deleted", false).is("assigned_technician_id", null)
      .not("status", "in", '("completed","canceled","declined")'),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_deleted", false)
      .eq("status", "pending").eq("booking_source", "website"),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_deleted", false)
      .in("status", ["en_route", "arrived", "in_progress"]),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_deleted", false).eq("status", "completed"),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("business_id", business.id).eq("is_deleted", false).eq("status", "canceled"),
  ]);
  if (jobsError) {
    console.error("Dashboard jobs query failed", { code: jobsError.code, businessId: business.id });
    throw new Error("Dashboard job metrics could not be loaded.");
  }

  const jobs = weekJobs ?? [];
  const jobsToday = jobs.filter((job) => job.starts_at && job.starts_at >= todayStart && job.starts_at < todayEnd);
  const active = jobs.filter((job) => !["completed", "canceled", "declined"].includes(job.status));
  const metrics = {
    today: jobsToday.length,
    week: jobs.length,
    unassigned: unassignedCount ?? 0,
    pending: pendingCount ?? 0,
    inProgress: inProgressCount ?? 0,
    completed: completedCount ?? 0,
    canceled: canceledCount ?? 0,
  };
  const upcoming = active.filter((job) => job.starts_at && job.starts_at >= new Date().toISOString()).slice(0, 6);
  const technicianByUser = new Map((technicians ?? []).map((item) => [item.member_user_id, item]));
  const invitationOrigin = (process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "http://localhost:3000").replace(/\/$/, "");

  return <main className="epic3-shell">
    <WorkspaceNav slug={businessSlug} name={business.name}/>
    <section className="epic3-content">
      <header className="epic3-header"><div><small>{role.replaceAll("_", " ")} workspace</small><h1>{business.name}</h1><p>Field-service operations at a glance.</p></div><Link href="/app">Switch workspace</Link></header>
      {query.created && <div className="workspace-notice success">Workspace created. You are the owner.</div>}
      {query.joined && <div className="workspace-notice success">Invitation accepted. Welcome to the team.</div>}
      {query.teamError && <div className="workspace-notice error">{query.teamError}</div>}
      {query.teamSuccess && <div className="workspace-notice success">{query.teamSuccess}</div>}

      <div className="sv-work-metrics dashboard-metrics">
        <article><small>Jobs today</small><strong>{metrics.today}</strong><Link href={`/app/${businessSlug}/dispatch?date=${today}`}>Open dispatch</Link></article>
        <article><small>Jobs this week</small><strong>{metrics.week}</strong><Link href={`/app/${businessSlug}/schedule`}>Open schedule</Link></article>
        <article><small>Unassigned</small><strong>{metrics.unassigned}</strong><Link href={`/app/${businessSlug}/schedule?technician=unassigned`}>Assign jobs</Link></article>
        <article><small>Pending bookings</small><strong>{metrics.pending}</strong><Link href={`/app/${businessSlug}/jobs?status=pending`}>Review bookings</Link></article>
        <article><small>In progress</small><strong>{metrics.inProgress}</strong><Link href={`/app/${businessSlug}/dispatch?date=${today}`}>View field work</Link></article>
        <article><small>Completed</small><strong>{metrics.completed}</strong><Link href={`/app/${businessSlug}/jobs?status=completed`}>View jobs</Link></article>
        <article><small>Cancelled</small><strong>{metrics.canceled}</strong><Link href={`/app/${businessSlug}/jobs?status=canceled`}>View jobs</Link></article>
        <article><small>Customers</small><strong>{customerCount ?? 0}</strong><Link href={`/app/${businessSlug}/customers`}>Manage customers</Link></article>
      </div>

      <div className="dashboard-grid">
        <section className="workspace-panel">
          <div className="panel-title"><div><span className="sv-kicker">Next up</span><h2>Upcoming appointments</h2></div><Link href={`/app/${businessSlug}/schedule`}>Full schedule</Link></div>
          <div className="activity-list">{upcoming.length ? upcoming.map((job) => {
            const customer = relation(job.customers);
            return <article key={job.id}><Link href={`/app/${businessSlug}/jobs/${job.id}`}><strong>#{job.job_number} · {job.title}</strong></Link><span>{customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")} · {formatBusinessDateTime(job.starts_at!, business.timezone)}</span></article>;
          }) : <p>No upcoming appointments this week.</p>}</div>
        </section>
        <section className="workspace-panel">
          <div className="panel-title"><div><span className="sv-kicker">CRM</span><h2>Recent customers</h2></div><Link href={`/app/${businessSlug}/customers`}>All customers</Link></div>
          <div className="activity-list">{recentCustomers?.length ? recentCustomers.map((customer) => <article key={customer.id}><Link href={`/app/${businessSlug}/customers/${customer.id}`}><strong>{customer.company_name || `${customer.first_name} ${customer.last_name}`}</strong></Link><span>Added {formatBusinessDateTime(customer.created_at, business.timezone)}</span></article>) : <p>No customers yet.</p>}</div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="workspace-panel"><span className="sv-kicker">Revenue</span><h2>Reporting placeholder</h2><p>Revenue reporting will be connected when invoicing is introduced.</p></section>
        <section className="workspace-panel"><span className="sv-kicker">Technician utilization</span><h2>Reporting placeholder</h2><p>Utilization reporting will build on assignments and completed work.</p></section>
      </div>

      <section className="workspace-panel">
        <div className="panel-title"><div><span className="sv-kicker">Activity</span><h2>Recent changes</h2></div></div>
        <div className="activity-list">{activity?.length ? activity.map((item) => <article key={item.id}><strong>{item.summary}</strong><span>{formatBusinessDateTime(item.created_at, business.timezone)}</span></article>) : <p>No recent activity.</p>}</div>
      </section>

      <section className="workspace-panel" id="team">
        <div className="panel-title"><div><span className="sv-kicker">Team</span><h2>Access and technician capability</h2><p>Workspace role and field-technician access are managed separately.</p></div></div>
        <div className="team-list">{(members ?? []).map((member) => {
          const profile = relation(member.profiles);
          const technician = technicianByUser.get(member.user_id);
          const assignable = Boolean(technician?.is_active && technician.is_technician && technician.can_be_assigned_jobs);
          return <article key={member.user_id}><div><strong>{profile?.full_name || profile?.email || "Team member"}</strong><span>{profile?.email} · {member.role} · {assignable ? "technician" : "not a technician"}</span></div>{canManage && <form action={(assignable ? disableTechnician : enableTechnician).bind(null, businessSlug)}><input type="hidden" name="memberUserId" value={member.user_id}/><button className="text-button">{assignable ? "Disable technician" : "Enable as technician"}</button></form>}</article>;
        })}</div>
      </section>

      {canManage && <section className="workspace-panel">
        <div><span className="sv-kicker">Invite employees</span><h2>Add someone to {business.name}</h2><p>Invitations expire after seven days. Their role will not automatically make them a technician.</p></div>
        {query.inviteLink && <div className="invite-link"><code>{query.inviteLink}</code><CopyInvitationLink url={query.inviteLink}/></div>}
        <form action={inviteTeamMember.bind(null, businessSlug)} className="team-invite-form"><label>Email<input required name="email" type="email" placeholder="employee@company.com"/></label><label>Role<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label><button className="sv-button">Send invitation</button></form>
        {(invites ?? []).length > 0 && <div className="pending-invites"><h3>Pending invitations</h3>{(invites ?? []).map((invite) => <article key={invite.id}><div><strong>{invite.email}</strong><span>{invite.role} · expires {formatBusinessDateTime(invite.expires_at, business.timezone)}</span></div><div className="pending-invite-actions"><CopyInvitationLink url={`${invitationOrigin}/invite/accept?token=${invite.token}`}/><form action={resendInvitation.bind(null, businessSlug)}><input type="hidden" name="invitationId" value={invite.id}/><button className="text-button">Resend</button></form><form action={revokeInvitation.bind(null, businessSlug)}><input type="hidden" name="invitationId" value={invite.id}/><button className="text-button">Revoke</button></form></div></article>)}</div>}
      </section>}
    </section>
  </main>;
}
