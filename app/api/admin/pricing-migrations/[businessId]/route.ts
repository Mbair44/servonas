import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";

const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
async function admin(){const db=await createSupabaseServerClient(),{data:{user}}=await db.auth.getUser();return isServonasPlatformAdmin(user)?db:null;}
export async function GET(_:Request,{params}:{params:Promise<{businessId:string}>}){
 const {businessId}=await params,db=await admin();if(!db)return NextResponse.json({error:"Platform administrator access is required."},{status:403});if(!uuid.test(businessId))return NextResponse.json({error:"Invalid business."},{status:400});
 const [{data:profile},{data:subscription},{data:audit}]=await Promise.all([db.from("business_pricing_profiles").select("plan_key,rollout_enabled,billing_anchor_at,legacy_pricing_preserved,migrated_at").eq("business_id",businessId).maybeSingle(),db.from("business_platform_subscriptions").select("plan_key,status,stripe_subscription_id,current_period_ends_at").eq("business_id",businessId).maybeSingle(),db.from("pricing_tenant_migration_audit").select("action,previous_profile,next_profile,activation_mode,reason,created_at").eq("business_id",businessId).order("created_at",{ascending:false}).limit(20)]);
 return NextResponse.json({profile,subscription,audit:audit??[],prerequisites:{starter:true,growth:Boolean(subscription?.plan_key==="growth"&&["active","trialing"].includes(subscription.status)),scale:Boolean(subscription?.plan_key==="scale"&&["active","trialing"].includes(subscription.status)),productionActivationEnabled:process.env.PRICING_MIGRATION_PRODUCTION_ENABLED==="true"}},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request,{params}:{params:Promise<{businessId:string}>}){
 const {businessId}=await params,db=await admin();if(!db)return NextResponse.json({error:"Platform administrator access is required."},{status:403});let body:{action?:string;targetPlan?:string;confirmation?:string;idempotencyKey?:string;activationMode?:string;reason?:string};try{body=await request.json();}catch{return NextResponse.json({error:"Invalid request."},{status:400});}
 if(body.action==="prepare_starter_communications"){if(!uuid.test(businessId))return NextResponse.json({error:"Invalid business."},{status:400});const {data,error}=await db.rpc("admin_prepare_starter_communication_downgrade",{p_business_id:businessId,p_confirmation:body.confirmation});return error?NextResponse.json({error:error.message},{status:409}):NextResponse.json({result:data});}
 if(!uuid.test(businessId)||!uuid.test(body.idempotencyKey??""))return NextResponse.json({error:"Invalid migration request."},{status:400});
 if(body.action==="migrate"){const mode=body.activationMode==="production"?"production":"test";if(mode==="production"&&process.env.PRICING_MIGRATION_PRODUCTION_ENABLED!=="true")return NextResponse.json({error:"Production pricing migration activation is disabled."},{status:409});const {data,error}=await db.rpc("admin_migrate_tenant_pricing",{p_business_id:businessId,p_target_plan:body.targetPlan,p_confirmation:body.confirmation,p_idempotency_key:body.idempotencyKey,p_activation_mode:mode,p_reason:body.reason??null});return error?NextResponse.json({error:error.message},{status:409}):NextResponse.json({result:data});}
 if(body.action==="rollback"){const {data,error}=await db.rpc("admin_rollback_tenant_pricing",{p_business_id:businessId,p_confirmation:body.confirmation,p_idempotency_key:body.idempotencyKey,p_reason:body.reason??null});return error?NextResponse.json({error:error.message},{status:409}):NextResponse.json({result:data});}
 return NextResponse.json({error:"Unknown migration action."},{status:400});
}
