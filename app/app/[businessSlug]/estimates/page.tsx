import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { formatCents } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";

const statuses = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "converted",
  "void",
] as const;
const sortKeys = [
  "estimate",
  "customer",
  "issue_date",
  "expiration_date",
  "status",
  "total",
] as const;
type EstimateSort = (typeof sortKeys)[number];
const pageSize = 25;

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "—";

export default async function EstimatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  let query = supabase
    .from("estimates")
    .select(
      "id,estimate_number,title,status,grand_total_cents,currency,issue_date,expiration_date,created_at,customers!estimates_customer_fk(first_name,last_name,company_name,email)",
    )
    .eq("business_id", business.id)
    .eq("is_deleted", false);
  if (q.status && (statuses as readonly string[]).includes(q.status)) {
    query = query.eq("status", q.status);
  }
  if (q.customerId) query = query.eq("customer_id", q.customerId);
  if (q.q) {
    const search = q.q.replaceAll(",", "");
    query = query.or(
      `estimate_number.ilike.%${search}%,title.ilike.%${search}%`,
    );
  }
  if (q.from) query = query.gte("created_at", `${q.from}T00:00:00Z`);
  if (q.to) query = query.lte("created_at", `${q.to}T23:59:59Z`);

  const [{ data: estimates, error }, { data: customers }] = await Promise.all([
    query.order("created_at", { ascending: false }).limit(1000),
    supabase
      .from("customers")
      .select("id,first_name,last_name,company_name")
      .eq("business_id", business.id)
      .eq("is_deleted", false)
      .order("last_name"),
  ]);
  if (error) {
    console.error("Estimate directory could not be loaded", {
      businessId: business.id,
      code: error.code,
    });
    throw new Error("Estimates could not be loaded.");
  }

  const sort = (sortKeys as readonly string[]).includes(q.sort ?? "")
    ? (q.sort as EstimateSort)
    : "estimate";
  const direction = q.direction === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(q.page) || 1);
  const base = `/app/${businessSlug}/estimates`;
  const rows = (estimates ?? [])
    .map((estimate) => {
      const customer = Array.isArray(estimate.customers)
        ? estimate.customers[0]
        : estimate.customers;
      return {
        ...estimate,
        customer,
        customerName:
          customer?.company_name ||
          `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim() ||
          "No customer",
      };
    })
    .sort((left, right) => {
      const value = (estimate: (typeof left)): string | number => {
        if (sort === "customer") return estimate.customerName;
        if (sort === "issue_date") return estimate.issue_date ?? "";
        if (sort === "expiration_date") return estimate.expiration_date ?? "";
        if (sort === "status") return estimate.status;
        if (sort === "total") return Number(estimate.grand_total_cents);
        return estimate.estimate_number;
      };
      const a = value(left);
      const b = value(right);
      const comparison =
        typeof a === "string" && typeof b === "string"
          ? a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          : Number(a) - Number(b);
      return (
        (direction === "asc" ? comparison : -comparison) ||
        left.estimate_number.localeCompare(right.estimate_number, undefined, {
          numeric: true,
        })
      );
    });
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const href = (overrides: Record<string, string | undefined>) => {
    const values = {
      q: q.q,
      status: q.status,
      customerId: q.customerId,
      from: q.from,
      to: q.to,
      sort,
      direction,
      page: String(currentPage),
      ...overrides,
    };
    const search = new URLSearchParams(
      Object.entries(values).filter(
        (entry): entry is [string, string] =>
          Boolean(entry[1]) && entry[1] !== "all",
      ),
    );
    return `${base}${search.size ? `?${search}` : ""}#estimate-directory`;
  };
  const sortHref = (column: EstimateSort) =>
    href({
      sort: column,
      direction:
        sort === column && direction === "asc" ? "desc" : "asc",
      page: "1",
    });
  const sortHeader = (column: EstimateSort, label: string) => (
    <span
      role="columnheader"
      aria-sort={
        sort === column
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <Link className={sort === column ? "active" : ""} href={sortHref(column)}>
        {label}
        <i aria-hidden="true">
          {sort === column ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </i>
      </Link>
    </span>
  );

  return (
    <main className="epic3-shell">
      <WorkspaceNav slug={businessSlug} name={business.name} />
      <section className="epic3-content employee-directory-page estimate-directory-page">
        <header className="employee-page-header">
          <div>
            <nav aria-label="Breadcrumb">
              <span>Sales</span>
              <b aria-hidden="true">›</b>
              <span>Estimates</span>
            </nav>
            <h1>Estimates</h1>
            <p>Create, revise, send, and convert customer proposals.</p>
          </div>
          {canManageCustomers(role) && (
            <nav className="employee-primary-actions" aria-label="Estimate actions">
              <Link className="sv-button" href={`${base}/new`}>
                <span aria-hidden="true">＋</span>
                New estimate
              </Link>
            </nav>
          )}
        </header>

        {q.error && <div className="workspace-notice error">{q.error}</div>}
        {q.success && <div className="workspace-notice success">{q.success}</div>}

        <section
          className="employee-directory-shell estimate-directory-shell"
          id="estimate-directory"
        >
          <div className="employee-directory-main">
            <form className="employee-directory-toolbar estimate-directory-toolbar">
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="direction" value={direction} />
              <label className="employee-search">
                <span className="sr-only">Search estimates</span>
                <input
                  name="q"
                  defaultValue={q.q ?? ""}
                  placeholder="Search by estimate number or title..."
                />
                <b aria-hidden="true">⌕</b>
              </label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue={q.status ?? "all"}>
                  <option value="all">All statuses</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Customer</span>
                <select name="customerId" defaultValue={q.customerId ?? ""}>
                  <option value="">All customers</option>
                  {customers?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name ||
                        `${customer.first_name} ${customer.last_name}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>From</span>
                <input name="from" type="date" defaultValue={q.from ?? ""} />
              </label>
              <label>
                <span>To</span>
                <input name="to" type="date" defaultValue={q.to ?? ""} />
              </label>
              <button className="sv-button sv-secondary" type="submit">
                Filters
              </button>
              <Link className="jobs-clear-filters" href={`${base}#estimate-directory`}>
                Clear
              </Link>
            </form>

            <div className="estimate-table" role="table" aria-label="Estimates">
              <div className="estimate-table-head" role="row">
                {sortHeader("estimate", "Estimate")}
                {sortHeader("customer", "Customer")}
                {sortHeader("issue_date", "Issued")}
                {sortHeader("expiration_date", "Expires")}
                {sortHeader("status", "Status")}
                {sortHeader("total", "Total")}
              </div>
              {visible.length ? (
                visible.map((estimate) => (
                  <Link
                    role="row"
                    href={`${base}/${estimate.id}`}
                    key={estimate.id}
                  >
                    <span className="estimate-table-identity" role="cell">
                      <span className="estimate-table-icon" aria-hidden="true">
                        ◫
                      </span>
                      <span>
                        <strong>{estimate.estimate_number}</strong>
                        <small>{estimate.title || "Estimate"}</small>
                      </span>
                    </span>
                    <span className="estimate-customer" role="cell">
                      <strong>{estimate.customerName}</strong>
                      <small>{estimate.customer?.email || "No email"}</small>
                    </span>
                    <span role="cell">{formatDate(estimate.issue_date)}</span>
                    <span role="cell">
                      {formatDate(estimate.expiration_date)}
                    </span>
                    <span role="cell">
                      <b className={`estimate-status ${estimate.status}`}>
                        {estimate.status.replaceAll("_", " ")}
                      </b>
                    </span>
                    <strong className="estimate-money" role="cell">
                      {formatCents(
                        estimate.grand_total_cents,
                        estimate.currency,
                      )}
                    </strong>
                  </Link>
                ))
              ) : (
                <div className="dashboard-empty">
                  <strong>No matching estimates.</strong>
                  <p>Adjust the filters or create an estimate.</p>
                </div>
              )}
            </div>

            <footer className="customer-table-footer">
              <span>
                Showing{" "}
                {visible.length
                  ? `${(currentPage - 1) * pageSize + 1} to ${(currentPage - 1) * pageSize + visible.length}`
                  : "0"}{" "}
                of {rows.length} estimates
              </span>
              {totalPages > 1 && (
                <nav aria-label="Estimate pages">
                  {currentPage > 1 && (
                    <Link href={href({ page: String(currentPage - 1) })}>←</Link>
                  )}
                  <b>{currentPage}</b>
                  <span>of {totalPages}</span>
                  {currentPage < totalPages && (
                    <Link href={href({ page: String(currentPage + 1) })}>→</Link>
                  )}
                </nav>
              )}
            </footer>
          </div>
        </section>
      </section>
    </main>
  );
}
