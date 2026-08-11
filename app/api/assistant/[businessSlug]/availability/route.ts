import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {isBusinessAssistantEnabled} from "@/lib/assistant/access";

export async function GET(_request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{business}=await requireWorkspace(businessSlug);
 return NextResponse.json({enabled:await isBusinessAssistantEnabled(business.id)});
}
