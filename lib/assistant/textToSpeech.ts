export interface TextToSpeechProvider{
 supported():boolean;
 speak(text:string,handlers?:{onStart?:()=>void;onEnd?:()=>void}):void;
 stop():void;
}

export function speechFriendlyText(value:string){
 return value.replace(/https?:\/\/\S+/g,"link").replace(/\|/g,", ").replace(/[*_#`]/g,"").replace(/\s+/g," ").trim().slice(0,900);
}

export class BrowserSpeechSynthesisProvider implements TextToSpeechProvider{
 supported(){return typeof window!=="undefined"&&"speechSynthesis" in window&&"SpeechSynthesisUtterance" in window;}
 speak(text:string,handlers:{onStart?:()=>void;onEnd?:()=>void}={}){
  if(!this.supported())return;
  this.stop();
  const utterance=new SpeechSynthesisUtterance(speechFriendlyText(text));
  utterance.rate=1;utterance.onstart=()=>handlers.onStart?.();utterance.onend=()=>handlers.onEnd?.();utterance.onerror=()=>handlers.onEnd?.();
  window.speechSynthesis.speak(utterance);
 }
 stop(){if(this.supported())window.speechSynthesis.cancel();}
}
