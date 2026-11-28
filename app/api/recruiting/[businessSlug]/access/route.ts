import {NextResponse} from "next/server";
import {canManageRecruiting} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";

export async function GET(_:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 const {role}=await requireWorkspace(businessSlug);
 return NextResponse.json({allowed:canManageRecruiting(role)},{headers:{"Cache-Control":"private, no-store"}});
}
