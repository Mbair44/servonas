import {randomBytes} from "crypto";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {googleBusinessRedirectUri} from "@/lib/googleBusinessProfile";

export async function GET(_:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{business,role}=await requireWorkspace(businessSlug);if(!canManageBusiness(role))return NextResponse.redirect(new URL(`/app/${businessSlug}/settings/website?error=${encodeURIComponent("Only owners and administrators can connect Google.")}`,process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com"));
 const clientId=process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim();if(!clientId)return NextResponse.redirect(new URL(`/app/${businessSlug}/settings/website?error=${encodeURIComponent("Google Business OAuth is not configured.")}`,process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com"));
 const state=randomBytes(24).toString("base64url"),store=await cookies();store.set("servonas_google_business_oauth",JSON.stringify({state,businessSlug,businessId:business.id}),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/google-business",maxAge:600});
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");url.searchParams.set("client_id",clientId);url.searchParams.set("redirect_uri",googleBusinessRedirectUri());url.searchParams.set("response_type","code");url.searchParams.set("scope","https://www.googleapis.com/auth/business.manage");url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent");url.searchParams.set("state",state);return NextResponse.redirect(url);
}
