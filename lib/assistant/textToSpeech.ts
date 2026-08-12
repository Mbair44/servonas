export type TextToSpeechDiagnostics={event:string;details?:Record<string,unknown>};
export type TextToSpeechHandlers={onStart?:()=>void;onEnd?:()=>void;onError?:(category:string)=>void};
export interface TextToSpeechProvider{
 supported():boolean;
 initialize():void;
 speak(text:string,requestId:string,handlers?:TextToSpeechHandlers):Promise<void>;
 stop():void;
}

export function speechFriendlyText(value:string){
 return value.replace(/https?:\/\/\S+/g,"link").replace(/\|/g,", ").replace(/[*_#`]/g,"").replace(/\s+/g," ").trim().slice(0,2000);
}

export function speechPlaybackTimeoutMs(value:string){return Math.min(180_000,Math.max(15_000,speechFriendlyText(value).length*90));}

const SILENT_WAV="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";

export class OpenAITextToSpeechProvider implements TextToSpeechProvider{
 private audio:HTMLAudioElement|null=null;
 private objectUrl:string|null=null;
 private controller:AbortController|null=null;
 private generation=0;
 private readonly endpoint:string;
 private readonly debug?: (diagnostic:TextToSpeechDiagnostics)=>void;
 constructor(endpoint:string,debug?:(diagnostic:TextToSpeechDiagnostics)=>void){this.endpoint=endpoint;this.debug=debug;}
 supported(){return typeof window!=="undefined"&&typeof Audio!=="undefined"&&typeof URL?.createObjectURL==="function";}
 private emit(event:string,details:Record<string,unknown>={}){this.debug?.({event,details});}
 private releaseUrl(){if(this.objectUrl){URL.revokeObjectURL(this.objectUrl);this.objectUrl=null;this.emit("tts_object_url_revoked");}}
 initialize(){
  if(!this.supported())return;
  if(!this.audio)this.audio=new Audio();
  this.audio.preload="auto";this.audio.muted=true;this.audio.src=SILENT_WAV;
  const unlock=this.audio.play();
  if(unlock)void unlock.then(()=>{if(!this.audio)return;this.audio.pause();this.audio.currentTime=0;this.audio.muted=false;this.audio.removeAttribute("src");this.audio.load();this.emit("tts_audio_unlocked",{success:true});}).catch(error=>{if(this.audio)this.audio.muted=false;this.emit("tts_audio_unlocked",{success:false,errorName:error instanceof Error?error.name:"unknown"});});
 }
 async speak(text:string,requestId:string,handlers:TextToSpeechHandlers={}){
  const output=speechFriendlyText(text);
  if(!this.supported()){handlers.onError?.("unsupported");handlers.onEnd?.();return;}
  if(!output){handlers.onError?.("empty_text");handlers.onEnd?.();return;}
  const generation=++this.generation;this.stopPlayback(false);this.controller=new AbortController();
  try{
   this.emit("tts_request_started",{requestIdAvailable:Boolean(requestId),inputCharacterCount:output.length});
   const response=await fetch(this.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:output,requestId}),signal:this.controller.signal});
   if(!response.ok)throw new Error(response.status===429?"rate_limited":"tts_endpoint_failed");
   const blob=await response.blob();if(!blob.size||!blob.type.startsWith("audio/"))throw new Error("invalid_audio");
   if(generation!==this.generation)return;
   const audio=this.audio??new Audio();this.audio=audio;this.objectUrl=URL.createObjectURL(blob);audio.src=this.objectUrl;audio.preload="auto";audio.muted=false;
   const settle=()=>{if(generation!==this.generation)return;this.releaseUrl();this.controller=null;handlers.onEnd?.();};
   audio.onplay=()=>{if(generation===this.generation){this.emit("tts_playback_started",{contentType:blob.type});handlers.onStart?.();}};
   audio.onended=()=>{this.emit("tts_playback_ended");settle();};
   audio.onerror=()=>{this.emit("tts_playback_error",{category:"audio_playback_failed"});handlers.onError?.("audio_playback_failed");settle();};
   this.emit("tts_audio_ready",{contentType:blob.type,audioBytes:blob.size,provider:response.headers.get("x-servonas-tts-provider"),model:response.headers.get("x-servonas-tts-model"),voice:response.headers.get("x-servonas-tts-voice")});
   await audio.play();
  }catch(error){
   if(generation!==this.generation)return;
   const category=error instanceof DOMException&&error.name==="AbortError"?"aborted":error instanceof Error?error.message:"tts_failed";
   this.emit("tts_request_failed",{category,errorName:error instanceof Error?error.name:"unknown"});this.releaseUrl();this.controller=null;handlers.onError?.(category);handlers.onEnd?.();
  }
 }
 private stopPlayback(invalidate=true){if(invalidate)this.generation+=1;this.controller?.abort();this.controller=null;if(this.audio){this.audio.pause();this.audio.onplay=null;this.audio.onended=null;this.audio.onerror=null;this.audio.removeAttribute("src");this.audio.load();}this.releaseUrl();}
 stop(){this.stopPlayback(true);this.emit("tts_stopped");}
}
