import {NextResponse} from "next/server";
const bots=/bot|crawler|spider|facebookexternalhit|googleother|headless|lighthouse|playwright|puppeteer/i;
export async function POST(request:Request){const purpose=request.headers.get("purpose")||request.headers.get("x-middleware-prefetch")||"",ua=request.headers.get("user-agent")||"";console.warn("Marketing visitor event disabled",{route:"/api/marketing/events",purpose:purpose||null,isBot:bots.test(ua)});return new NextResponse(null,{status:204});}
