import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabaseServer";

const csv=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
export async function GET(_:Request,{params}:{params:Promise<{importId:string}>}){
 const {importId}=await params,supabase=await createSupabaseServerClient();
 const {data:session}=await supabase.from("employee_imports").select("id,business_id,file_name").eq("id",importId).maybeSingle();
 if(!session)return NextResponse.json({error:"Import not found."},{status:404});
 const {data:rows,error}=await supabase.from("employee_import_rows").select("source_row_number,raw_values,normalized_values,validation_errors,validation_warnings,commit_error_code").eq("business_id",session.business_id).eq("import_id",session.id).eq("commit_status","failed").order("source_row_number");
 if(error){console.error("Failed employee row export failed",{importId,code:error.code});return NextResponse.json({error:"Failed rows could not be exported."},{status:500});}
 const lines=[["Row","Original values","Current values","Reason","Suggested action"].map(csv).join(","),
  ...(rows??[]).map(row=>[row.source_row_number,JSON.stringify(row.raw_values),JSON.stringify(row.normalized_values),
   [...(row.validation_errors as string[]),...(row.validation_warnings as string[]),row.commit_error_code].filter(Boolean).join(" "),
   "Correct the row in Servonas, then retry it."].map(csv).join(","))];
 return new NextResponse(lines.join("\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${session.file_name.replace(/[^a-z0-9._-]/gi,"_")}-failed-rows.csv"`}});
}
