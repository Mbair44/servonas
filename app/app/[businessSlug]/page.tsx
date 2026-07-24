import Link from "next/link";
import { headers } from "next/headers";
import CopyInvitationLink from "@/components/CopyInvitationLink";
import { canManageBusiness } from "@/lib/access";
import { addDays, dateInTimeZone, formatBusinessDateTime, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { calendarDays } from "@/lib/scheduleCalendar";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "./WorkspaceNav";
import { formatCents } from "@/lib/financial/priceBook";
import { disableTechnician, enableTechnician, inviteTeamMember, resendInvitation, revokeInvitation } from "./team/actions";

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const activeStatuses = new Set(["pending","confirmed","scheduled","dispatched","en_route","arrived","in_progress"]);
function relativeTime(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

export default async function Workspace({ params, searchParams }: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, user, business, role } = await requireWorkspace(businessSlug);
  const canManage = canManageBusiness(role);
  const now = new Date();
  const nowMs = now.getTime();
  const today = dateInTimeZone(now, business.timezone);
  const tomorrow = addDays(today, 1);
  const weekDays = calendarDays(today, "week");
  const todayStart = zonedDateTimeToUtc(today, "00:00", business.timezone).toISOString();
  const todayEnd = zonedDateTimeToUtc(tomorrow, "00:00", business.timezone).toISOString();
  const weekStart = zonedDateTimeToUtc(weekDays[0], "00:00", business.timezone).toISOString();
  const weekEnd = zonedDateTimeToUtc(addDays(weekDays[6], 1), "00:00", business.timezone).toISOString();
  const customerWeekStart = weekStart;

  const [
    { data: jobs, error: jobsError },
    { data: customers, error: customersError },
    { data: members },
    { data: technicians },
    { data: activity },
    { data: invites },
  ] = await Promise.all([
    supabase.from("jobs")
      .select("id,job_number,title,status,starts_at,work_completed_at,assigned_technician_id,booking_source,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),technician_profiles!jobs_technician_tenant_fk(display_name)")
      .eq("business_id", business.id).eq("is_deleted", false)
      .order("starts_at", { ascending: true, nullsFirst: false }).limit(5000),
    supabase.from("customers").select("id,first_name,last_name,company_name,created_at")
      .eq("business_id", business.id).eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(1000),
    supabase.from("business_members")
      .select("user_id,role,created_at,profiles!business_members_user_profile_fk(email,full_name)")
      .eq("business_id", business.id).order("created_at"),
    supabase.from("technician_profiles")
      .select("id,member_user_id,display_name,technician_status,is_active,is_technician,can_be_assigned_jobs")
      .eq("business_id", business.id),
    supabase.from("business_activity").select("id,summary,created_at")
      .eq("business_id", business.id).order("created_at", { ascending: false }).limit(10),
    canManage
      ? supabase.from("business_invitations").select("id,email,role,token,expires_at")
          .eq("business_id", business.id).is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; role: string; token: string; expires_at: string }> }),
  ]);
  if (jobsError || customersError) {
    console.error("Executive dashboard query failed", { jobsCode: jobsError?.code, customersCode: customersError?.code, businessId: business.id });
    throw new Error("Dashboard metrics could not be loaded.");
  }
  const {data:financial,error:financialError}=await supabase.rpc("financial_dashboard_summary",{p_business_id:business.id,p_as_of:today});
  if(financialError)console.error("Financial dashboard summary failed",{code:financialError.code,businessId:business.id});
  const money=(key:string)=>Number((financial as Record<string,unknown>|null)?.[key]??0);

  const allJobs = jobs ?? [];
  const todayJobs = allJobs.filter((job) => job.starts_at && job.starts_at >= todayStart && job.starts_at < todayEnd);
  const weekJobs = allJobs.filter((job) => job.starts_at && job.starts_at >= weekStart && job.starts_at < weekEnd);
  const scheduledToday = todayJobs.filter((job) => ["confirmed","scheduled","dispatched"].includes(job.status)).length;
  const progressingToday = todayJobs.filter((job) => ["en_route","arrived","in_progress"].includes(job.status)).length;
  const waitingToday = todayJobs.filter((job) => job.status === "pending").length;
  const remainingWeek = weekJobs.filter((job) => activeStatuses.has(job.status) && job.starts_at! >= now.toISOString()).length;
  const unassigned = allJobs.filter((job) => !job.assigned_technician_id && activeStatuses.has(job.status)).length;
  const pending = allJobs.filter((job) => job.status === "pending" && job.booking_source === "website").length;
  const inProgress = allJobs.filter((job) => ["en_route","arrived","in_progress"].includes(job.status)).length;
  const completedToday = allJobs.filter((job) => job.status === "completed" && job.work_completed_at && job.work_completed_at >= todayStart && job.work_completed_at < todayEnd).length;
  const canceled = allJobs.filter((job) => job.status === "canceled").length;
  const newCustomers = (customers ?? []).filter((customer) => customer.created_at >= customerWeekStart).length;
  const todaySchedule = todayJobs.filter((job) => !["canceled","declined"].includes(job.status));
  const workingTechnicians = (technicians ?? []).filter((tech) =>
    tech.is_active && tech.is_technician && tech.can_be_assigned_jobs &&
    (["assigned","en_route","on_site"].includes(tech.technician_status) || todayJobs.some((job) => job.assigned_technician_id === tech.id))
  );
  const profile = relation((members ?? []).find((member) => member.user_id === user.id)?.profiles ?? null);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "there";
  const greetingHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: business.timezone, hour: "numeric", hourCycle: "h23" }).format(now));
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: business.timezone, weekday: "long", month: "long", day: "numeric" }).format(now);
  const technicianByUser = new Map((technicians ?? []).map((item) => [item.member_user_id, item]));
  const invitationOrigin = (process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "http://localhost:3000").replace(/\/$/, "");
  const alerts = [
    { count: unassigned, label: "Jobs unassigned", href: `/app/${businessSlug}/dispatch?date=${today}` },
    { count: pending, label: "Pending bookings", href: `/app/${businessSlug}/jobs?status=pending` },
    { count: canceled, label: "Cancelled jobs", href: `/app/${businessSlug}/jobs?status=canceled` },
  ].filter((alert) => alert.count > 0);

  return <main className="epic3-shell executive-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content executive-dashboard">
    <header className="executive-header"><div><span className="executive-workspace">{business.name} · {role.replaceAll("_"," ")} workspace</span><h1>{greeting}, {firstName}</h1><p>Today is {todayLabel}. Here&apos;s what&apos;s happening in your business.</p></div><Link className="workspace-switcher" href="/app">Switch workspace <span aria-hidden="true">⌄</span></Link></header>
    {query.created && <div className="workspace-notice success">Workspace created. You are the owner.</div>}{query.joined && <div className="workspace-notice success">Invitation accepted. Welcome to the team.</div>}{query.teamError && <div className="workspace-notice error">{query.teamError}</div>}{query.teamSuccess && <div className="workspace-notice success">{query.teamSuccess}</div>}

    <section aria-labelledby="overview-heading"><h2 className="sr-only" id="overview-heading">Business overview</h2><div className="executive-kpis">
      <article className="executive-card kpi-card"><div className="card-icon blue" aria-hidden="true">↗</div><div><span>Jobs today</span><strong>{todayJobs.length}</strong></div><p>{scheduledToday} Scheduled · {progressingToday} In progress · {waitingToday} Waiting</p><Link href={`/app/${businessSlug}/dispatch?date=${today}`}>Open dispatch <span aria-hidden="true">→</span></Link></article>
      <article className="executive-card kpi-card"><div className="card-icon violet" aria-hidden="true">◫</div><div><span>This week</span><strong>{weekJobs.length} <small>jobs</small></strong></div><p>{remainingWeek} remaining on the schedule</p><Link href={`/app/${businessSlug}/schedule`}>View schedule <span aria-hidden="true">→</span></Link></article>
      <article className="executive-card kpi-card"><div className="card-icon green" aria-hidden="true">$</div><div><span>Payments this month</span><strong>{formatCents(money("payments_month_cents"))}</strong></div><p>{formatCents(money("payments_today_cents"))} received today</p><Link href={`/app/${businessSlug}/invoices`}>View invoices <span aria-hidden="true">→</span></Link></article>
      <article className="executive-card kpi-card"><div className="card-icon green" aria-hidden="true">◎</div><div><span>Customers</span><strong>{customers?.length ?? 0} <small>customers</small></strong></div><p>{newCustomers} new this week</p><Link href={`/app/${businessSlug}/customers`}>Manage customers <span aria-hidden="true">→</span></Link></article>
    </div></section>

    {alerts.length > 0 && <section className="attention-alerts" aria-labelledby="attention-heading"><div className="section-heading"><div><span>Action center</span><h2 id="attention-heading">Needs attention</h2></div><p>Items that may need an office decision.</p></div><div>{alerts.map((alert) => <Link key={alert.label} href={alert.href}><strong>{alert.count}</strong><span>{alert.label}</span><b aria-hidden="true">→</b></Link>)}</div></section>}

    <section className="executive-two-column" aria-label="Today at a glance">
      <article className="executive-card schedule-card"><div className="section-heading compact"><div><span>Today&apos;s activity</span><h2>Today&apos;s schedule</h2></div><Link href={`/app/${businessSlug}/schedule`}>Full schedule</Link></div>
        <div className="today-schedule">{todaySchedule.length ? todaySchedule.map((job) => {
          const customer = relation(job.customers); const tech = relation(job.technician_profiles);
          const time = new Intl.DateTimeFormat("en-US", { timeZone: business.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(job.starts_at!));
          return <Link href={`/app/${businessSlug}/jobs/${job.id}`} key={job.id}><time>{time}</time><span><strong>{job.title}</strong><small>{customer?.company_name || [customer?.first_name,customer?.last_name].filter(Boolean).join(" ") || "Customer"}{tech?.display_name ? ` · ${tech.display_name}` : " · Unassigned"}</small></span><em className={`estimate-status ${job.status}`}>{job.status.replaceAll("_"," ")}</em></Link>;
        }) : <div className="dashboard-empty"><span aria-hidden="true">◷</span><strong>No scheduled work today.</strong><p>New appointments will appear here automatically.</p></div>}</div>
      </article>
      <article className="executive-card technician-card"><div className="section-heading compact"><div><span>Field team</span><h2>Technicians working</h2></div><Link href={`/app/${businessSlug}/dispatch?date=${today}`}>Dispatch</Link></div>
        <div className="working-techs">{workingTechnicians.length ? workingTechnicians.map((tech) => <div key={tech.id}><span className="tech-avatar">{tech.display_name.slice(0,2).toUpperCase()}</span><p><strong>{tech.display_name}</strong><small>{tech.technician_status.replaceAll("_"," ")}</small></p><i className={`tech-presence ${tech.technician_status}`}/></div>) : <div className="dashboard-empty"><span aria-hidden="true">◇</span><strong>No technicians working right now.</strong><p>Assignments and field status will appear here.</p></div>}</div>
      </article>
    </section>

    <section aria-labelledby="operations-heading"><div className="section-heading"><div><span>Operations</span><h2 id="operations-heading">Work overview</h2></div></div><div className="operations-grid">
      {[
        ["Pending bookings",pending,"Review bookings",`/app/${businessSlug}/jobs?status=pending`,"amber"],
        ["Unassigned jobs",unassigned,"Assign jobs",`/app/${businessSlug}/dispatch?date=${today}`,"red"],
        ["Jobs in progress",inProgress,"View field work",`/app/${businessSlug}/dispatch?date=${today}`,"blue"],
        ["Completed today",completedToday,"View completed",`/app/${businessSlug}/jobs?status=completed`,"green"],
        ["Cancelled",canceled,"View jobs",`/app/${businessSlug}/jobs?status=canceled`,"gray"],
      ].map(([label,count,action,href,tone]) => <article className="executive-card operation-card" key={String(label)}><span className={`operation-dot ${tone}`}/><div><span>{label}</span><strong>{count}</strong></div><Link href={String(href)}>{action} <span aria-hidden="true">→</span></Link></article>)}
    </div></section>

    <section className="executive-two-column lower">
      <article className="executive-card"><div className="section-heading compact"><div><span>Live feed</span><h2>Recent activity</h2></div></div><div className="executive-activity">{activity?.length ? activity.map((item) => <div key={item.id}><span aria-hidden="true">✓</span><p><strong>{item.summary}</strong><small>{relativeTime(item.created_at,nowMs)}</small></p></div>) : <div className="dashboard-empty"><span aria-hidden="true">✦</span><strong>No recent activity.</strong><p>As your business grows, activity will appear here.</p></div>}</div></article>
      <article className="executive-card future-card"><div className="section-heading compact"><div><span>Financial outlook</span><h2>Billing and aging</h2></div><Link href={`/app/${businessSlug}/invoices`}>Invoices</Link></div><div className="future-grid">{[
        ["Outstanding invoices",formatCents(money("outstanding_invoice_cents"))],["Overdue",formatCents(money("overdue_cents"))],
        ["Outstanding estimates",formatCents(money("outstanding_estimate_cents"))],["Average ticket",formatCents(money("average_ticket_cents"))],
        ["Draft estimates",String(money("draft_estimates"))],["Sent estimates",String(money("sent_estimates"))],
        ["Estimate conversion",`${money("decided_estimates")?Math.round(money("accepted_estimates")/money("decided_estimates")*100):0}%`],["Draft invoices",String(money("draft_invoices"))],
        ["Current",formatCents(money("aging_current_cents"))],["1–30 days",formatCents(money("aging_1_30_cents"))],
        ["31–60 days",formatCents(money("aging_31_60_cents"))],["61–90 days",formatCents(money("aging_61_90_cents"))],
        ["90+ days",formatCents(money("aging_90_plus_cents"))],["Refunds this month",formatCents(money("refunds_month_cents"))],
      ].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></article>
    </section>

    <section className="quick-actions-section" aria-labelledby="quick-heading"><div className="section-heading compact"><div><span>Shortcuts</span><h2 id="quick-heading">Quick actions</h2></div></div><nav aria-label="Dashboard quick actions"><Link href={`/app/${businessSlug}/jobs/new`}><span>＋</span>New job</Link><Link href={`/app/${businessSlug}/customers/new`}><span>＋</span>New customer</Link><Link href={`/book/${businessSlug}`}><span>↗</span>New booking</Link><Link href={`/app/${businessSlug}/dispatch`}><span>⌁</span>Dispatch board</Link><Link href={`/app/${businessSlug}/schedule`}><span>▦</span>Schedule</Link></nav></section>

    <section className="workspace-panel team-management" id="team"><div className="panel-title"><div><span className="sv-kicker">Team</span><h2>Access and technician capability</h2><p>Workspace role and field-technician access are managed separately.</p></div></div><div className="team-list">{(members ?? []).map((member) => {
      const memberProfile=relation(member.profiles); const technician=technicianByUser.get(member.user_id); const assignable=Boolean(technician?.is_active&&technician.is_technician&&technician.can_be_assigned_jobs);
      return <article key={member.user_id}><div><strong>{memberProfile?.full_name||memberProfile?.email||"Team member"}</strong><span>{memberProfile?.email} · {member.role} · {assignable?"technician":"not a technician"}</span></div>{canManage&&<form action={(assignable?disableTechnician:enableTechnician).bind(null,businessSlug)}><input type="hidden" name="memberUserId" value={member.user_id}/><button className="text-button">{assignable?"Disable technician":"Enable as technician"}</button></form>}</article>;
    })}</div></section>
    {canManage&&<section className="workspace-panel"><div><span className="sv-kicker">Invite employees</span><h2>Add someone to {business.name}</h2><p>Invitations expire after seven days. Their role will not automatically make them a technician.</p></div>{query.inviteLink&&<div className="invite-link"><code>{query.inviteLink}</code><CopyInvitationLink url={query.inviteLink}/></div>}<form action={inviteTeamMember.bind(null,businessSlug)} className="team-invite-form"><label>Email<input required name="email" type="email" placeholder="employee@company.com"/></label><label>Role<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label><button className="sv-button">Send invitation</button></form>{(invites??[]).length>0&&<div className="pending-invites"><h3>Pending invitations</h3>{(invites??[]).map(invite=><article key={invite.id}><div><strong>{invite.email}</strong><span>{invite.role} · expires {formatBusinessDateTime(invite.expires_at,business.timezone)}</span></div><div className="pending-invite-actions"><CopyInvitationLink url={`${invitationOrigin}/invite/accept?token=${invite.token}`}/><form action={resendInvitation.bind(null,businessSlug)}><input type="hidden" name="invitationId" value={invite.id}/><button className="text-button">Resend</button></form><form action={revokeInvitation.bind(null,businessSlug)}><input type="hidden" name="invitationId" value={invite.id}/><button className="text-button">Revoke</button></form></div></article>)}</div>}</section>}
  </section></main>;
}
