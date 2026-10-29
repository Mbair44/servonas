import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";
import {WorkspaceNav} from "../WorkspaceNav";
import {GoogleReviewsDashboard} from "@/components/GoogleReviewsDashboard";
import {GoogleReviewsSyncButton} from "@/components/GoogleReviewsSyncButton";
import {decideGoogleReviewMatch,proposeGoogleReviewMatch,removeGoogleReviewMatch} from "./actions";

const pageSize=20;
export default async function ReviewsPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{filter?:string;q?:string;page?:string}>}){
 const {businessSlug}=await params,{filter:rawFilter,q:rawQuery,page:rawPage}=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
 const filter=["all","suggested","matched","unmatched"].includes(rawFilter??"")?rawFilter??"all":"all",query=(rawQuery??"").trim().slice(0,100),page=Math.max(1,Number.parseInt(rawPage??"1",10)||1),manage=canManageBusiness(role);
 let list=supabase.from("google_reviews").select("id,reviewer_display_name,star_rating,review_text,review_created_at,google_review_url,google_review_customer_matches(id,status,customer_id,customers(first_name,last_name,company_name))").eq("business_id",business.id).order("review_created_at",{ascending:false});
 if(query)list=list.ilike("reviewer_display_name",`%${query.replaceAll("%","\\%").replaceAll("_","\\_")}%`);
 const [{data:allReviews,error},{data:googleConnection}]=await Promise.all([
  list.limit(500),
  supabase.from("business_google_profile_connections").select("status").eq("business_id",business.id).maybeSingle(),
 ]);if(error)console.error("Could not load Google reviews",{businessId:business.id,code:error.code});
 const all=allReviews??[],metrics={total:all.length,suggested:all.filter((review:any)=>review.google_review_customer_matches?.some((match:any)=>match.status==="suggested")).length,confirmed:all.filter((review:any)=>review.google_review_customer_matches?.some((match:any)=>match.status==="confirmed")).length,unmatched:all.filter((review:any)=>!(review.google_review_customer_matches?.length)).length};
 const filtered=all.filter((review:any)=>{const matches=review.google_review_customer_matches??[];if(filter==="all")return true;if(filter==="suggested")return matches.some((match:any)=>match.status==="suggested");if(filter==="matched")return matches.some((match:any)=>match.status==="confirmed");return !matches.length;});
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize)),current=Math.min(page,pages),reviews=filtered.slice((current-1)*pageSize,current*pageSize);
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content reviews-dashboard"><header className="page-header"><div><h1>Google Reviews</h1><p>Match and confirm reviews to suppress only future review-request SMS for the correct customer.</p></div>{manage&&googleConnection?.status==="connected"&&<GoogleReviewsSyncButton businessSlug={businessSlug}/>}</header>{error?<section className="workspace-notice error">Reviews could not be loaded. Refresh and try again.</section>:<GoogleReviewsDashboard businessSlug={businessSlug} reviews={reviews as any} metrics={metrics} canManage={manage} page={current} pages={pages} filter={filter} query={query} proposeAction={proposeGoogleReviewMatch.bind(null,businessSlug)} decideAction={decideGoogleReviewMatch.bind(null,businessSlug)} removeAction={removeGoogleReviewMatch.bind(null,businessSlug)}/>}</section></main>;
}
