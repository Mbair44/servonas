import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {assistantDisabledMessage,isBusinessAssistantEnabled} from "@/lib/assistant/access";
import {getSpeechGenerationProvider,SpeechGenerationError,TTS_MAX_TEXT_LENGTH} from "@/lib/assistant/speechGeneration";
import {consumeVoiceTranscriptionLimit} from "@/lib/assistant/voiceRateLimit";

export const runtime="nodejs";
const requestIdPattern=/^[a-zA-Z0-9_-]{8,128}$/;
const messageFor=(category:string)=>category==="not_configured"?"Voice responses are not configured yet.":"I couldn't play that voice response.";
const safeHeader=(value:string)=>value.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100);

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{business,user}=await requireWorkspace(businessSlug);
 if(!await isBusinessAssistantEnabled(business.id))return NextResponse.json({error:assistantDisabledMessage},{status:403});
 if(!consumeVoiceTranscriptionLimit(`tts:${business.id}:${user.id}`))return NextResponse.json({error:"Too many voice requests. Wait a moment and try again."},{status:429});
 let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:"A valid JSON request body is required."},{status:400});}
 const record=typeof body==="object"&&body!==null?body as Record<string,unknown>:{};
 const text=typeof record.text==="string"?record.text.trim():"",requestId=typeof record.requestId==="string"?record.requestId.trim():"";
 if(!text)return NextResponse.json({error:"Response text is required."},{status:400});
 if(text.length>TTS_MAX_TEXT_LENGTH)return NextResponse.json({error:`Response text must be ${TTS_MAX_TEXT_LENGTH} characters or fewer.`},{status:413});
 if(!requestIdPattern.test(requestId))return NextResponse.json({error:"A valid request ID is required."},{status:400});
 try{
  const result=await getSpeechGenerationProvider().generate({text,requestId});
  return new Response(result.audio,{status:200,headers:{"Content-Type":result.contentType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Servonas-TTS-Provider":result.provider,"X-Servonas-TTS-Model":safeHeader(result.model),"X-Servonas-TTS-Voice":safeHeader(result.voice),"X-Servonas-TTS-Input-Characters":String(result.inputCharacterCount),...(result.providerRequestId?{"X-Servonas-TTS-Request-Id":safeHeader(result.providerRequestId)}:{})}});
 }catch(error){
  const category=error instanceof SpeechGenerationError?error.category:"provider_unavailable";
  console.error("Assistant voice generation failed",{businessId:business.id,userId:user.id,category,errorName:error instanceof Error?error.name:"unknown",requestIdAvailable:Boolean(requestId)});
  return NextResponse.json({error:messageFor(category)},{status:category==="not_configured"?503:502});
 }
}
