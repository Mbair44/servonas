import Link from "next/link";
import {canManageCustomers} from "@/lib/access";
import {formatCents} from "@/lib/financial/priceBook";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../WorkspaceNav";
import {retryScheduledPayment} from "./actions";

const money=(value:number)=>formatCents(value,"USD");
const dateLabel=(value:string|null)=>value?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"—";
const statusFor=(booking:any,attempt:any)=>{
 if(Number(booking.balance_due_cents??0)<=0)return "paid";
 if(["cancelled","canceled","expired","refunded"].includes(String(booking.status??"").toLowerCase()))return "canceled";
 if(["pending","processing"].includes(String(attempt?.status??"")))return "processing";
 if(attempt?.status==="failed")return "failed";
 return booking.balance_charge_scheduled_for&&new Date(booking.balance_charge_scheduled_for).getTime()>Date.now()?"scheduled":"failed";
};

export default async function ScheduledPaymentsPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{status?:string;success?:string;error?:string}>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),editable=canManageCustomers(role);
 const [bookingsResult,customersResult,invoiceResult,attemptResult,paymentResult,methodsResult]=await Promise.all([
  supabase.from("bookings").select("id,booking_number,customer_id,job_id,status,total_cents,amount_paid_cents,balance_due_cents,balance_charge_scheduled_for,stripe_payment_method_id,rental_starts_at").eq("business_id",business.id).not("balance_charge_scheduled_for","is",null).order("balance_charge_scheduled_for",{ascending:true}).limit(2000),
  supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id",business.id).limit(3000),
  supabase.from("invoices").select("id,job_id,booking_id").eq("business_id",business.id).eq("is_deleted",false).limit(3000),
  supabase.from("payment_attempts").select("invoice_id,status,failure_code,failure_reason,provider_payment_intent_id,attempted_at,completed_at").eq("business_id",business.id).order("attempted_at",{ascending:false}).limit(6000),
  supabase.from("payments").select("invoice_id,booking_id,status,payment_method_type,failure_message,created_at").eq("business_id",business.id).order("created_at",{ascending:false}).limit(6000),
  supabase.from("customer_payment_methods").select("provider_payment_method_id,brand,last_four,method_type,status").eq("business_id",business.id).eq("status","active").limit(3000),
 ]);
 const customers=new Map((customersResult.data??[]).map((row:any)=>[row.id,row.company_name||`${row.first_name??""} ${row.last_name??""}`.trim()||"Customer"]));
 const bookingInvoices=new Map((invoiceResult.data??[]).filter((row:any)=>row.booking_id).map((row:any)=>[row.booking_id,row.id]));
 const latestAttempt=new Map<string,any>();for(const row of attemptResult.data??[])if(!latestAttempt.has(row.invoice_id))latestAttempt.set(row.invoice_id,row);
 const latestPayment=new Map<string,any>();for(const row of paymentResult.data??[]){const key=row.booking_id||((invoiceResult.data??[]).find((invoice:any)=>invoice.id===row.invoice_id)?.booking_id);if(key&&!latestPayment.has(key))latestPayment.set(key,row);}
 const methods=new Map((methodsResult.data??[]).map((row:any)=>[row.provider_payment_method_id,row.last_four?`${row.brand??row.method_type} •••• ${row.last_four}`:row.method_type]));
 const rows=(bookingsResult.data??[]).map((booking:any)=>{const invoiceId=bookingInvoices.get(booking.id),attempt=invoiceId?latestAttempt.get(invoiceId):null,payment=latestPayment.get(booking.id);return {...booking,customer:customers.get(booking.customer_id)??"Customer",attempt,payment,statusLabel:statusFor(booking,attempt),paymentMethod:methods.get(booking.stripe_payment_method_id)??(booking.stripe_payment_method_id?"Card on file":payment?.payment_method_type??null),failureReason:attempt?.failure_reason??payment?.failure_message??null};});
 const filter=["upcoming","failed","paid","all"].includes(q.status??"")?q.status!:"upcoming";
 const visible=rows.filter((row:any)=>filter==="all"||(filter==="paid"?row.statusLabel==="paid":filter==="failed"?row.statusLabel==="failed":["scheduled","processing","failed"].includes(row.statusLabel)));
 const link=(status:string)=>`/app/${businessSlug}/financials/scheduled-payments?status=${status}`;
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content employee-directory-page invoice-directory-page"><header className="employee-page-header"><div><nav aria-label="Breadcrumb"><span>Financials</span><b>›</b><span>Scheduled payments</span></nav><h1>Scheduled payments</h1><p>Review upcoming and automatic booking balance payments.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/invoices/receivables`}>Outstanding payments</Link></header>{q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}<section className="employee-directory-shell invoice-directory-shell"><div className="employee-directory-main"><nav className="scheduled-payment-filters" aria-label="Payment status"><Link className={filter==="upcoming"?"active":""} href={link("upcoming")}>Upcoming</Link><Link className={filter==="failed"?"active":""} href={link("failed")}>Failed</Link><Link className={filter==="paid"?"active":""} href={link("paid")}>Paid</Link><Link className={filter==="all"?"active":""} href={link("all")}>All</Link></nav><div className="invoice-table receivables-table scheduled-payments-table" role="table" aria-label="Scheduled payments"><div className="invoice-table-head" role="row"><span>Customer / booking</span><span>Amount</span><span>Scheduled charge</span><span>Status</span><span>Payment method</span><span>Last attempt</span><span>Actions</span></div>{visible.length?visible.map((row:any)=><div role="row" key={row.id}><span role="cell"><strong>{row.customer}</strong><small>Booking #{row.booking_number??"—"}</small></span><span role="cell"><strong>{money(Number(row.balance_due_cents??0))}</strong><small>{money(Number(row.amount_paid_cents??0))} paid</small></span><span role="cell">{dateLabel(row.balance_charge_scheduled_for)}</span><span role="cell"><b className={`estimate-status ${row.statusLabel}`}>{row.statusLabel[0].toUpperCase()+row.statusLabel.slice(1)}</b>{row.failureReason&&<small>{row.failureReason}</small>}</span><span role="cell">{row.paymentMethod??"Not available"}</span><span role="cell">{dateLabel(row.attempt?.attempted_at??row.payment?.created_at??null)}</span><span role="cell">{editable&&row.statusLabel==="failed"&&<details><summary className="text-button">Retry payment</summary><p>Confirm {row.customer} · {money(Number(row.balance_due_cents??0))} current remaining balance.</p><form action={retryScheduledPayment.bind(null,businessSlug,row.id)}><button className="sv-button">Confirm retry</button></form></details>}{row.job_id&&<Link className="text-button" href={`/app/${businessSlug}/jobs/${row.job_id}`}>View booking</Link>}</span></div>):<div className="dashboard-empty"><strong>No scheduled payments match this view.</strong><p>Try another status filter.</p></div>}</div></div></section></section></main>;
}
