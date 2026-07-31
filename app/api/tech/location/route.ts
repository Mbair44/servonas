import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabaseServer";

export async function POST(request:Request){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const body=await request.json().catch(()=>null) as null|{jobId?:string;latitude?:number;longitude?:number;accuracy?:number;heading?:number|null;speed?:number|null;capturedAt?:string;startTravel?:boolean};
 if(!body?.jobId||![body.latitude,body.longitude,body.accuracy].every(Number.isFinite)||!body.capturedAt)return NextResponse.json({error:"A valid location reading is required."},{status:400});
 const {data,error}=await supabase.rpc("record_technician_live_location",{
  p_job_id:body.jobId,p_latitude:body.latitude,p_longitude:body.longitude,p_accuracy_meters:body.accuracy,
  p_captured_at:body.capturedAt,p_heading_degrees:Number.isFinite(body.heading)?body.heading:null,
  p_speed_meters_per_second:Number.isFinite(body.speed)?body.speed:null,p_start_travel:Boolean(body.startTravel),
 });
 if(error){
  console.error("Technician live location update failed",{userId:user.id,jobId:body.jobId,code:error.code});
  return NextResponse.json({error:error.code==="23514"?"Location sharing is unavailable for the current job status.":"Location could not be updated."},{status:error.code==="42501"?403:400});
 }
 return NextResponse.json(data);
}

export async function DELETE(request:Request){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const jobId=new URL(request.url).searchParams.get("jobId");
 if(!jobId)return NextResponse.json({error:"Job is required."},{status:400});
 const {error}=await supabase.rpc("stop_technician_live_location",{p_job_id:jobId});
 if(error)return NextResponse.json({error:"Location sharing could not be stopped."},{status:400});
 return NextResponse.json({stopped:true});
}
