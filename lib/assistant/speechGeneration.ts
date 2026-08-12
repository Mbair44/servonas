export const TTS_MAX_TEXT_LENGTH=2000;
export const TTS_DEFAULT_MODEL="gpt-4o-mini-tts";
export const TTS_DEFAULT_VOICE="marin";

export type SpeechGenerationResult={audio:ArrayBuffer;contentType:"audio/mpeg";provider:"openai";model:string;voice:string;providerRequestId:string|null;inputCharacterCount:number;durationMs:null};
export class SpeechGenerationError extends Error{
 readonly category:"not_configured"|"provider_rejected"|"provider_unavailable"|"invalid_response";
 constructor(category:SpeechGenerationError["category"]){super(category);this.category=category;this.name="SpeechGenerationError";}
}
export interface SpeechGenerationProvider{generate(input:{text:string;requestId:string}):Promise<SpeechGenerationResult>;}

export class OpenAISpeechGenerationProvider implements SpeechGenerationProvider{
 private readonly apiKey:string|undefined;
 private readonly model:string;
 private readonly voice:string;
 constructor(apiKey=process.env.OPENAI_API_KEY?.trim(),model=process.env.OPENAI_TTS_MODEL?.trim()||TTS_DEFAULT_MODEL,voice=process.env.OPENAI_TTS_VOICE?.trim()||TTS_DEFAULT_VOICE){this.apiKey=apiKey;this.model=model;this.voice=voice;}
 async generate(input:{text:string;requestId:string}):Promise<SpeechGenerationResult>{
  if(!this.apiKey)throw new SpeechGenerationError("not_configured");
  let response:Response;
  try{response=await fetch("https://api.openai.com/v1/audio/speech",{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json","X-Client-Request-Id":input.requestId},body:JSON.stringify({model:this.model,voice:this.voice,input:input.text,response_format:"mp3"})});}
  catch{throw new SpeechGenerationError("provider_unavailable");}
  if(!response.ok)throw new SpeechGenerationError("provider_rejected");
  let audio:ArrayBuffer;try{audio=await response.arrayBuffer();}catch{throw new SpeechGenerationError("invalid_response");}
  if(!audio.byteLength)throw new SpeechGenerationError("invalid_response");
  return{audio,contentType:"audio/mpeg",provider:"openai",model:this.model,voice:this.voice,providerRequestId:response.headers.get("x-request-id"),inputCharacterCount:input.text.length,durationMs:null};
 }
}
export const getSpeechGenerationProvider=():SpeechGenerationProvider=>new OpenAISpeechGenerationProvider();
