import {NextResponse} from "next/server";
import {canManageBusiness} from "@/lib/access";
import {syncGoogleAdsSpend} from "@/lib/googleAdsSpendSync";
import {requireWorkspace} from "@/lib/workspace";
export async function POST(_:Request,{params}:{params:Promise<{businessSlug:string}>}){const {businessSlug}=await params;const {business,role}=await requireWorkspace(businessSlug);if(!canManageBusiness(role))return NextResponse.json({error:"Forbidden"},{status:403});try{return NextResponse.json(await syncGoogleAdsSpend({businessId:business.id}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Google Ads sync failed."},{status:502});}}
