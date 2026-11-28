import {NextResponse} from "next/server";
import {isAuthorizedCronRequest} from "@/lib/cronAuth";
import {dispatchRecruitingEmails} from "@/lib/communications/recruitingEmailService";
export async function GET(request:Request){if(!isAuthorizedCronRequest(request))return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json(await dispatchRecruitingEmails(50));}
