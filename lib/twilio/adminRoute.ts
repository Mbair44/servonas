import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../supabaseServer.ts";
import { canProvisionBusinessTwilioSubaccount } from "./provisioningAccess.ts";

export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function requireTwilioPlatformAdmin(){const session=await createSupabaseServerClient();const {data:{user}}=await session.auth.getUser();return canProvisionBusinessTwilioSubaccount(user)?null:NextResponse.json({error:"Unauthorized"},{status:401});}
