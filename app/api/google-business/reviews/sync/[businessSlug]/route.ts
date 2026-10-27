import {NextResponse} from "next/server";
import {canManageBusiness} from "@/lib/access";
import {GoogleReviewSyncConflictError,GoogleReviewSyncCooldownError,syncGoogleBusinessReviews} from "@/lib/googleBusinessProfile";
import {requireWorkspace} from "@/lib/workspace";

export async function POST(_:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 const {business,role}=await requireWorkspace(businessSlug);
 if(!canManageBusiness(role))return NextResponse.json({error:"Only business owners and administrators can sync Google reviews."},{status:403});
 try{return NextResponse.json(await syncGoogleBusinessReviews(business.id));}
 catch(error){
  if(error instanceof GoogleReviewSyncConflictError)return NextResponse.json({error:error.message},{status:409});
  if(error instanceof GoogleReviewSyncCooldownError)return NextResponse.json({error:error.message},{status:429});
  return NextResponse.json({error:error instanceof Error?error.message:"Google review sync failed."},{status:502});
 }
}
