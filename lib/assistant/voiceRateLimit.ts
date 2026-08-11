const windows=new Map<string,{startedAt:number;count:number}>();
const WINDOW_MS=60_000;
const MAX_REQUESTS=10;

export function consumeVoiceTranscriptionLimit(key:string,now=Date.now()){
 const current=windows.get(key);
 if(!current||now-current.startedAt>=WINDOW_MS){windows.set(key,{startedAt:now,count:1});return true;}
 if(current.count>=MAX_REQUESTS)return false;
 current.count+=1;
 return true;
}
