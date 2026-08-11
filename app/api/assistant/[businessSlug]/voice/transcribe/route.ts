import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {assistantDisabledMessage,isBusinessAssistantEnabled} from "@/lib/assistant/access";
import {getSpeechToTextProvider,isSupportedAudioMimeType,normalizedAudioMimeType,SpeechToTextError,VOICE_MAX_DURATION_MS,VOICE_MAX_UPLOAD_BYTES,VOICE_MIN_DURATION_MS} from "@/lib/assistant/speechToText";
import {consumeVoiceTranscriptionLimit} from "@/lib/assistant/voiceRateLimit";

export const runtime="nodejs";

const messageFor=(category:string)=>category==="not_configured"?"Voice transcription is not configured yet.":"I couldn't transcribe that recording. Try again.";
const extensionFor=(mime:string)=>mime.includes("webm")?"webm":mime.includes("mp4")||mime.includes("m4a")?"m4a":mime.includes("ogg")?"ogg":mime.includes("wav")?"wav":mime.includes("flac")?"flac":"mp3";

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{business,user}=await requireWorkspace(businessSlug);
 if(!await isBusinessAssistantEnabled(business.id))return NextResponse.json({error:assistantDisabledMessage},{status:403});
 if(!consumeVoiceTranscriptionLimit(`${business.id}:${user.id}`))return NextResponse.json({error:"Too many voice requests. Wait a moment and try again."},{status:429});
 let form:FormData;try{form=await request.formData();}catch{return NextResponse.json({error:"That recording could not be read."},{status:400});}
 const audio=form.get("audio"),durationMs=Number(form.get("durationMs"));
 if(!(audio instanceof File)||audio.size===0)return NextResponse.json({error:"I couldn't hear anything. Try again."},{status:400});
 if(audio.size>VOICE_MAX_UPLOAD_BYTES)return NextResponse.json({error:"That recording is too large. Try a shorter command."},{status:413});
 if(!isSupportedAudioMimeType(audio.type))return NextResponse.json({error:"That audio format is not supported on this device."},{status:415});
 if(!Number.isFinite(durationMs)||durationMs<VOICE_MIN_DURATION_MS)return NextResponse.json({error:"I couldn't hear enough to transcribe. Try again."},{status:400});
 if(durationMs>VOICE_MAX_DURATION_MS)return NextResponse.json({error:"Your recording was too long. Try a shorter command."},{status:413});
 try{
  const provider=getSpeechToTextProvider(),mime=normalizedAudioMimeType(audio.type);
  const result=await provider.transcribe({audio,fileName:`voice-command.${extensionFor(mime)}`,durationMs});
  return NextResponse.json({transcript:result.text,transcription:{provider:result.provider,model:result.model,durationMs:result.durationMs,requestId:result.providerRequestId}});
 }catch(error){
  const category=error instanceof SpeechToTextError?error.category:"provider_unavailable";
  console.error("Assistant voice transcription failed",{businessId:business.id,userId:user.id,category,errorName:error instanceof Error?error.name:"unknown"});
  return NextResponse.json({error:messageFor(category)},{status:category==="not_configured"?503:502});
 }
}
