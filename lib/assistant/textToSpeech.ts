export type TextToSpeechDiagnostics={event:string;details?:Record<string,unknown>};
export interface TextToSpeechProvider{
 supported():boolean;
 initialize():void;
 speak(text:string,handlers?:{onStart?:()=>void;onEnd?:()=>void;onError?:(category:string)=>void}):void;
 stop():void;
}

export function speechFriendlyText(value:string){
 return value.replace(/https?:\/\/\S+/g,"link").replace(/\|/g,", ").replace(/[*_#`]/g,"").replace(/\s+/g," ").trim().slice(0,900);
}

export function speechPlaybackTimeoutMs(value:string){return Math.min(20_000,Math.max(5_000,speechFriendlyText(value).length*75));}

export class BrowserSpeechSynthesisProvider implements TextToSpeechProvider{
 private activeUtterance:SpeechSynthesisUtterance|null=null;
 private voices:SpeechSynthesisVoice[]=[];
 private initialized=false;
 private readonly debug?: (diagnostic:TextToSpeechDiagnostics)=>void;
 constructor(debug?:(diagnostic:TextToSpeechDiagnostics)=>void){this.debug=debug;}
 supported(){return typeof window!=="undefined"&&"speechSynthesis" in window&&"SpeechSynthesisUtterance" in window;}
 private emit(event:string,details:Record<string,unknown>={}){this.debug?.({event,details});}
 private loadVoices(){if(!this.supported())return;this.voices=window.speechSynthesis.getVoices();this.emit("voices_loaded",{voicesAvailable:this.voices.length>0,voiceCount:this.voices.length});}
 initialize(){
  if(!this.supported())return;this.initialized=true;this.loadVoices();
  window.speechSynthesis.onvoiceschanged=()=>this.loadVoices();
  if(window.speechSynthesis.paused)window.speechSynthesis.resume();
  this.emit("tts_initialized",{voicesAvailable:this.voices.length>0,speaking:window.speechSynthesis.speaking,pending:window.speechSynthesis.pending,paused:window.speechSynthesis.paused});
 }
 private preferredVoice(){return this.voices.find(voice=>voice.lang.toLowerCase().startsWith("en-us")&&/samantha|ava|allison|siri|enhanced/i.test(voice.name))??this.voices.find(voice=>voice.lang.toLowerCase().startsWith("en-us"))??this.voices.find(voice=>voice.lang.toLowerCase().startsWith("en"))??null;}
 speak(text:string,handlers:{onStart?:()=>void;onEnd?:()=>void;onError?:(category:string)=>void}={}){
  if(!this.supported()){handlers.onError?.("unsupported");handlers.onEnd?.();return;}
  const output=speechFriendlyText(text);if(!output){handlers.onError?.("empty_text");handlers.onEnd?.();return;}
  try{
   if(!this.initialized)this.initialize();
   if(this.activeUtterance)window.speechSynthesis.cancel();
   const utterance=new SpeechSynthesisUtterance(output),voice=this.preferredVoice();this.activeUtterance=utterance;if(voice)utterance.voice=voice;utterance.rate=1;
   const release=()=>{if(this.activeUtterance===utterance)this.activeUtterance=null;};
   utterance.onstart=()=>{this.emit("utterance_started",{selectedVoice:voice?.name??"browser-default",speaking:window.speechSynthesis.speaking,pending:window.speechSynthesis.pending,paused:window.speechSynthesis.paused});handlers.onStart?.();};
   utterance.onend=()=>{this.emit("utterance_ended",{speaking:window.speechSynthesis.speaking,pending:window.speechSynthesis.pending,paused:window.speechSynthesis.paused});release();handlers.onEnd?.();};
   utterance.onerror=event=>{const category=event.error||"speech_error";this.emit("utterance_error",{category,speaking:window.speechSynthesis.speaking,pending:window.speechSynthesis.pending,paused:window.speechSynthesis.paused});release();handlers.onError?.(category);handlers.onEnd?.();};
   this.emit("utterance_created",{textAvailable:true,textLength:output.length,selectedVoice:voice?.name??"browser-default",voicesAvailable:this.voices.length>0});
   window.speechSynthesis.speak(utterance);this.emit("speech_speak_called",{speaking:window.speechSynthesis.speaking,pending:window.speechSynthesis.pending,paused:window.speechSynthesis.paused});
  }catch(error){this.activeUtterance=null;const category=error instanceof Error?error.name:"speech_exception";this.emit("utterance_error",{category});handlers.onError?.(category);handlers.onEnd?.();}
 }
 stop(){if(!this.supported())return;this.activeUtterance=null;window.speechSynthesis.cancel();this.emit("tts_stopped");}
}
