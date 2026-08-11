export const VOICE_MAX_DURATION_MS=60_000;
export const VOICE_MIN_DURATION_MS=350;
export const VOICE_MAX_UPLOAD_BYTES=4*1024*1024;

const supportedMimeTypes=new Set(["audio/mpeg","audio/mp3","audio/mp4","audio/m4a","audio/x-m4a","audio/wav","audio/x-wav","audio/webm","audio/ogg","audio/flac"]);
export const normalizedAudioMimeType=(value:string)=>value.toLowerCase().split(";",1)[0].trim();
export const isSupportedAudioMimeType=(value:string)=>supportedMimeTypes.has(normalizedAudioMimeType(value));

export type TranscriptionResult={
 text:string;
 provider:"openai";
 model:string;
 providerRequestId:string|null;
 durationMs:number;
};

export interface SpeechToTextProvider{
 readonly supportedMimeTypes:readonly string[];
 readonly maxDurationMs:number;
 transcribe(input:{audio:Blob;fileName:string;durationMs:number}):Promise<TranscriptionResult>;
}

export class SpeechToTextError extends Error{
 readonly category:"not_configured"|"provider_rejected"|"provider_unavailable"|"invalid_response";
 constructor(category:"not_configured"|"provider_rejected"|"provider_unavailable"|"invalid_response"){super(category);this.category=category;this.name="SpeechToTextError";}
}

export class OpenAISpeechToTextProvider implements SpeechToTextProvider{
 readonly supportedMimeTypes=Array.from(supportedMimeTypes);
 readonly maxDurationMs=VOICE_MAX_DURATION_MS;
 private readonly apiKey:string|undefined;
 private readonly model:string;
 constructor(apiKey=process.env.OPENAI_API_KEY?.trim(),model=process.env.OPENAI_TRANSCRIPTION_MODEL?.trim()||"gpt-4o-mini-transcribe"){this.apiKey=apiKey;this.model=model;}
 async transcribe(input:{audio:Blob;fileName:string;durationMs:number}):Promise<TranscriptionResult>{
  if(!this.apiKey)throw new SpeechToTextError("not_configured");
  const form=new FormData();
  form.set("model",this.model);
  form.set("file",input.audio,input.fileName);
  form.set("response_format","json");
  let response:Response;
  try{response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`},body:form});}
  catch{throw new SpeechToTextError("provider_unavailable");}
  if(!response.ok)throw new SpeechToTextError("provider_rejected");
  let body:unknown;
  try{body=await response.json();}catch{throw new SpeechToTextError("invalid_response");}
  const text=typeof body==="object"&&body!==null&&"text" in body?String((body as {text?:unknown}).text??"").trim():"";
  if(!text)throw new SpeechToTextError("invalid_response");
  return{text:text.slice(0,4000),provider:"openai",model:this.model,providerRequestId:response.headers.get("x-request-id"),durationMs:input.durationMs};
 }
}

export const getSpeechToTextProvider=():SpeechToTextProvider=>new OpenAISpeechToTextProvider();
