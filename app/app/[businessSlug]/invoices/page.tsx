import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { formatCents } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";

const statuses = [
  "draft",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
  "void",
  "uncollectible",
  "refunded",
] as const;
const pageSize = 25;
const sortKeys = [
  "invoice",
  "customer",
  "issue_date",
  "due_date",
  "status",
  "total",
  "balance",
] as const;
type InvoiceSort = (typeof sortKeys)[number];

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "—";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id,invoice_number,title,status,grand_total_cents,balance_due_cents,currency,issue_date,due_date,created_at,customers!invoices_customer_fk(first_name,last_name,company_name,email)",
    )
    .eq("business_id", business.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Invoice directory could not be loaded", {
      businessId: business.id,
      code: error.code,
    });
  }

  const search = (q.q ?? "").trim().toLowerCase();
  const status = [...statuses, "open"].includes(q.status ?? "")
    ? q.status!
    : "all";
  const sort = (sortKeys as readonly string[]).includes(q.sort ?? "")
    ? (q.sort as InvoiceSort)
    : "invoice";
  const direction = q.direction === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(q.page) || 1);
  const base = `/app/${businessSlug}/invoices`;

  const directory = (invoices ?? []).map((invoice) => {
    const customer = Array.isArray(invoice.customers)
      ? invoice.customers[0]
      : invoice.customers;
    return {
      ...invoice,
      customer,
      customerName:
        customer?.company_name ||
        `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim() ||
        "No customer",
    };
  });

  const rows = directory
    .filter(
      (invoice) =>
        (status === "all" ||
          invoice.status === status ||
          (status === "open" &&
            Number(invoice.balance_due_cents) > 0 &&
            !["draft", "void", "uncollectible", "refunded"].includes(
              invoice.status,
            ))) &&
        (!search ||
          [
            invoice.invoice_number,
            invoice.title,
            invoice.customerName,
            invoice.customer?.email,
          ].some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(search),
          )),
    )
    .sort((left, right) => {
      const value = (invoice: (typeof directory)[number]): string | number => {
        if (sort === "customer") return invoice.customerName;
        if (sort === "issue_date") return invoice.issue_date ?? "";
        if (sort === "due_date") return invoice.due_date ?? "";
        if (sort === "status") return invoice.status;
        if (sort === "total") return Number(invoice.grand_total_cents);
        if (sort === "balance") return Number(invoice.balance_due_cents);
        return invoice.invoice_number;
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
        left.invoice_number.localeCompare(right.invoice_number, undefined, {
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
  const openCount = directory.filter(
    (invoice) =>
      Number(invoice.balance_due_cents) > 0 &&
      !["draft", "void", "uncollectible", "refunded"].includes(invoice.status),
  ).length;
  const overdueCount = directory.filter(
    (invoice) => invoice.status === "overdue",
  ).length;
  const paidCount = directory.filter(
    (invoice) => invoice.status === "paid",
  ).length;

  const href = (overrides: Record<string, string | undefined>) => {
    const values = {
      q: q.q,
      status,
      sort,
      direction,
      page: String(currentPage),
      ...overrides,
    };
    const query = new URLSearchParams(
      Object.entries(values).filter(
        (entry): entry is [string, string] =>
          Boolean(entry[1]) && entry[1] !== "all",
      ),
    );
    return `${base}${query.size ? `?${query}` : ""}#invoice-directory`;
  };
  const sortHref = (column: InvoiceSort) =>
    href({
      sort: column,
      direction:
        sort === column && direction === "asc" ? "desc" : "asc",
      page: "1",
    });
  const sortHeader = (column: InvoiceSort, label: string) => (
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
      <section className="epic3-content employee-directory-page invoice-directory-page">
        <header className="employee-page-header">
          <div>
            <nav aria-label="Breadcrumb">
              <span>Billing</span>
              <b aria-hidden="true">›</b>
              <span>Invoices</span>
            </nav>
            <h1>Invoices</h1>
            <p>Track billing, payments, due dates, and customer balances.</p>
          </div>
          {canManageCustomers(role) && (
            <nav className="employee-primary-actions" aria-label="Invoice actions">
              <Link className="sv-button" href={`${base}/new`}>
                <span aria-hidden="true">＋</span>
                New invoice
              </Link>
            </nav>
          )}
        </header>

        {q.error && <div className="workspace-notice error">{q.error}</div>}
        {q.success && <div className="workspace-notice success">{q.success}</div>}
        {error && (
          <div className="workspace-notice error">
            Invoices could not be loaded. Please try again.
          </div>
        )}

        <section className="employee-stat-row invoice-stat-row" aria-label="Invoice summary">
          <Link href={`${base}#invoice-directory`}>
            <span>Total invoices</span>
            <strong>{directory.length.toLocaleString()}</strong>
            <small className="new">● All records</small>
            <i aria-hidden="true">▤</i>
          </Link>
          <Link href={href({ status: "open", page: "1" })}>
            <span>Open balances</span>
            <strong>{openCount.toLocaleString()}</strong>
            <small className="warning">● Needs payment</small>
            <i aria-hidden="true">$</i>
          </Link>
          <Link href={href({ status: "overdue", page: "1" })}>
            <span>Overdue</span>
            <strong>{overdueCount.toLocaleString()}</strong>
            <small className={overdueCount ? "warning" : "healthy"}>
              ● {overdueCount ? "Needs attention" : "Current"}
            </small>
            <i aria-hidden="true">!</i>
          </Link>
          <Link href={href({ status: "paid", page: "1" })}>
            <span>Paid</span>
            <strong>{paidCount.toLocaleString()}</strong>
            <small className="healthy">● Collected</small>
            <i aria-hidden="true">✓</i>
          </Link>
        </section>

        <section
          className="employee-directory-shell invoice-directory-shell"
          id="invoice-directory"
        >
          <div className="employee-directory-main">
            <form className="employee-directory-toolbar invoice-directory-toolbar">
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="direction" value={direction} />
              <label className="employee-search">
                <span className="sr-only">Search invoices</span>
                <input
                  name="q"
                  defaultValue={q.q ?? ""}
                  placeholder="Search invoice, title, customer, or email..."
                />
                <b aria-hidden="true">⌕</b>
              </label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue={status}>
                  <option value="all">All statuses</option>
                  <option value="open">Open balances</option>
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <button className="sv-button sv-secondary" type="submit">
                Filters
              </button>
              {(search || status !== "all") && (
                <Link className="jobs-clear-filters" href={`${base}#invoice-directory`}>
                  Clear
                </Link>
              )}
            </form>

            <div className="invoice-table" role="table" aria-label="Invoices">
              <div className="invoice-table-head" role="row">
                {sortHeader("invoice", "Invoice")}
                {sortHeader("customer", "Customer")}
                {sortHeader("issue_date", "Issued")}
                {sortHeader("due_date", "Due")}
                {sortHeader("status", "Status")}
                {sortHeader("total", "Total")}
                {sortHeader("balance", "Balance")}
              </div>
              {visible.length ? (
                visible.map((invoice) => (
                  <Link
                    role="row"
                    href={`${base}/${invoice.id}`}
                    key={invoice.id}
                  >
                    <span className="invoice-table-identity" role="cell">
                      <span className="invoice-table-icon" aria-hidden="true">
                        ▤
                      </span>
                      <span>
                        <strong>{invoice.invoice_number}</strong>
                        <small>{invoice.title || "Invoice"}</small>
                      </span>
                    </span>
                    <span className="invoice-customer" role="cell">
                      <strong>{invoice.customerName}</strong>
                      <small>{invoice.customer?.email || "No email"}</small>
                    </span>
                    <span role="cell">{formatDate(invoice.issue_date)}</span>
                    <span role="cell">{formatDate(invoice.due_date)}</span>
                    <span role="cell">
                      <b className={`estimate-status ${invoice.status}`}>
                        {invoice.status.replaceAll("_", " ")}
                      </b>
                    </span>
                    <span className="invoice-money" role="cell">
                      {formatCents(
                        invoice.grand_total_cents,
                        invoice.currency,
                      )}
                    </span>
                    <span
                      className={`invoice-money${Number(invoice.balance_due_cents) > 0 ? " due" : ""}`}
                      role="cell"
                    >
                      {formatCents(
                        invoice.balance_due_cents,
                        invoice.currency,
                      )}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="dashboard-empty">
                  <strong>No matching invoices.</strong>
                  <p>Adjust the filters or create an invoice.</p>
                </div>
              )}
            </div>

            <footer className="customer-table-footer">
              <span>
                Showing{" "}
                {visible.length
                  ? `${(currentPage - 1) * pageSize + 1} to ${(currentPage - 1) * pageSize + visible.length}`
                  : "0"}{" "}
                of {rows.length} invoices
              </span>
              {totalPages > 1 && (
                <nav aria-label="Invoice pages">
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
