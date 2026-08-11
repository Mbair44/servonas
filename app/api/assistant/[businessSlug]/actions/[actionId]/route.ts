import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {resolveAssistantAction} from "@/lib/assistant/orchestrator";
import {assistantDisabledMessage,isBusinessAssistantEnabled} from "@/lib/assistant/access";

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string;actionId:string}>}){const {businessSlug,actionId}=await params,{supabase,business,user,role}=await requireWorkspace(businessSlug);if(!await isBusinessAssistantEnabled(business.id))return NextResponse.json({error:assistantDisabledMessage},{status:403});let body:{decision?:string};try{body=await request.json();}catch{return NextResponse.json({error:"Choose Confirm or Cancel."},{status:400});}if(body.decision!=="confirm"&&body.decision!=="reject")return NextResponse.json({error:"Choose Confirm or Cancel."},{status:400});try{return NextResponse.json(await resolveAssistantAction({supabase,business,user,role,conversationId:"",channel:"web"},actionId,body.decision));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"I couldn't complete that action."},{status:400});}}
