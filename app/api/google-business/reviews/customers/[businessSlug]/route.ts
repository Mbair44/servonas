import {NextResponse} from "next/server";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";

export async function GET(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{business,role,supabase}=await requireWorkspace(businessSlug);if(!canManageBusiness(role))return NextResponse.json({error:"Forbidden"},{status:403});
 const q=new URL(request.url).searchParams.get("q")?.trim()??"";if(q.length<2)return NextResponse.json({customers:[]});
 const safeQuery=q.replace(/[,%_().]/g," ").replace(/\s+/g," ").trim();if(safeQuery.length<2)return NextResponse.json({customers:[]});
 const term=`%${safeQuery}%`,{data:customers,error}=await supabase.from("customers").select("id,first_name,last_name,company_name,email,phone").eq("business_id",business.id).eq("is_deleted",false).or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},company_name.ilike.${term}`).order("last_name").limit(20);
 if(error)return NextResponse.json({error:"Customers could not be searched."},{status:500});
 const ids=(customers??[]).map(customer=>customer.id),{data:jobs}=ids.length?await supabase.from("jobs").select("customer_id,title,starts_at,work_completed_at,status").eq("business_id",business.id).in("customer_id",ids).eq("is_deleted",false).order("starts_at",{ascending:false}).limit(100):{data:[]};
 return NextResponse.json({customers:(customers??[]).map(customer=>({...customer,bookings:(jobs??[]).filter(job=>job.customer_id===customer.id).slice(0,3)}))});
}
