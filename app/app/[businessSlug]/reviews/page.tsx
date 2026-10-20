import Link from "next/link";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {WorkspaceNav} from "../WorkspaceNav";
import {decideGoogleReviewMatch} from "./actions";

export default async function ReviewsPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{status?:string}>}){
 const {businessSlug}=await params,{status}=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
 const query=supabase.from("google_reviews").select("id,reviewer_display_name,star_rating,review_text,review_created_at,google_review_url,business_google_locations(location_title),google_review_customer_matches(id,status,customer_id,customers(first_name,last_name))").eq("business_id",business.id).order("review_created_at",{ascending:false}).limit(200);
 const {data:reviews,error}=await query;if(error)console.error("Could not load Google reviews",{businessId:business.id,code:error.code});
 const filtered=(reviews??[]).filter((review:any)=>{
  if(!status||status==="all")return true;
  if(status==="unmatched")return !review.google_review_customer_matches?.length;
  return review.google_review_customer_matches?.some((m:any)=>m.status===status);
 });
 const manage=canManageCustomers(role);
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="page-header"><div><h1>Google Reviews</h1><p>Confirm customer links before they suppress future review requests.</p></div></header><p><Link href={`/app/${businessSlug}/reviews`}>All</Link> · <Link href={`/app/${businessSlug}/reviews?status=suggested`}>Suggested</Link> · <Link href={`/app/${businessSlug}/reviews?status=confirmed`}>Matched</Link> · <Link href={`/app/${businessSlug}/reviews?status=unmatched`}>Unmatched</Link></p>{filtered.map((review:any)=>{const match=review.google_review_customer_matches?.[0],customer=match?.customers;return <article className="workspace-panel" key={review.id}><h2>{review.reviewer_display_name} · {"★".repeat(review.star_rating??0)}</h2><p>{review.review_text||"No written review"}</p><small>{review.business_google_locations?.location_title||"Google location"} · {review.review_created_at?new Date(review.review_created_at).toLocaleDateString():"Date unavailable"}</small><p>{match?<>{match.status}: {customer?<Link href={`/app/${businessSlug}/customers/${match.customer_id}`}>{customer.first_name} {customer.last_name}</Link>:"customer"}</>:"Unmatched"}</p>{manage&&match?.status==="suggested"&&<p><form action={decideGoogleReviewMatch.bind(null,businessSlug,review.id,match.customer_id,"confirmed")}><button className="sv-button">Confirm match</button></form> <form action={decideGoogleReviewMatch.bind(null,businessSlug,review.id,match.customer_id,"rejected")}><button className="sv-button sv-secondary">Reject</button></form></p>}{review.google_review_url&&<a href={review.google_review_url} target="_blank">Open on Google</a>}</article>;})}{!filtered.length&&<section className="workspace-panel"><p>No reviews match this filter. Connect Google Business Profile and run a validated sync to populate this list.</p></section>}</section></main>;
}
