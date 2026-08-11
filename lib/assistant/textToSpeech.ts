export interface TextToSpeechProvider{
 supported():boolean;
 speak(text:string,handlers?:{onStart?:()=>void;onEnd?:()=>void}):void;
 stop():void;
}

export function speechFriendlyText(value:string){
 return value.replace(/https?:\/\/\S+/g,"link").replace(/\|/g,", ").replace(/[*_#`]/g,"").replace(/\s+/g," ").trim().slice(0,900);
}

export function speechPlaybackTimeoutMs(value:string){return Math.min(20_000,Math.max(5_000,speechFriendlyText(value).length*75));}

export class BrowserSpeechSynthesisProvider implements TextToSpeechProvider{
 supported(){return typeof window!=="undefined"&&"speechSynthesis" in window&&"SpeechSynthesisUtterance" in window;}
 speak(text:string,handlers:{onStart?:()=>void;onEnd?:()=>void}={}){
  if(!this.supported())return;
  try{
   this.stop();
   const utterance=new SpeechSynthesisUtterance(speechFriendlyText(text));
   utterance.rate=1;utterance.onstart=()=>handlers.onStart?.();utterance.onend=()=>handlers.onEnd?.();utterance.onerror=()=>handlers.onEnd?.();
   window.speechSynthesis.speak(utterance);
  }catch{handlers.onEnd?.();}
 }
 stop(){if(this.supported())window.speechSynthesis.cancel();}
}
