export type VoiceActivityConfig={
 calibrationMs:number;
 minimumSpeechMs:number;
 silenceMs:number;
 noSpeechMs:number;
 minimumThreshold:number;
 noiseMultiplier:number;
};

export const DEFAULT_VOICE_ACTIVITY_CONFIG:VoiceActivityConfig={
 calibrationMs:500,
 minimumSpeechMs:140,
 silenceMs:1500,
 noSpeechMs:10_000,
 minimumThreshold:0.025,
 noiseMultiplier:2.8,
};

export type VoiceActivityEvent="waiting"|"speech_started"|"speech"|"silence"|"auto_stop"|"no_speech";

export class VoiceActivityTracker{
 private readonly startedAt:number;
 private noiseTotal=0;
 private noiseSamples=0;
 private speechCandidateAt:number|null=null;
 private silenceStartedAt:number|null=null;
 private beganSpeaking=false;
 private stopped=false;
 private threshold:number;
 private readonly config:VoiceActivityConfig;
 constructor(startedAt:number,config:VoiceActivityConfig=DEFAULT_VOICE_ACTIVITY_CONFIG){this.startedAt=startedAt;this.config=config;this.threshold=config.minimumThreshold;}
 hasSpeech(){return this.beganSpeaking;}
 speechThreshold(){return this.threshold;}
 sample(rms:number,now:number):VoiceActivityEvent{
  if(this.stopped)return this.beganSpeaking?"auto_stop":"no_speech";
  const level=Number.isFinite(rms)?Math.max(0,rms):0;
  if(now-this.startedAt<this.config.calibrationMs){this.noiseTotal+=level;this.noiseSamples+=1;return"waiting";}
  if(this.noiseSamples){const floor=this.noiseTotal/this.noiseSamples;this.threshold=Math.max(this.config.minimumThreshold,Math.min(.18,floor*this.config.noiseMultiplier));this.noiseSamples=0;}
  if(!this.beganSpeaking&&now-this.startedAt>=this.config.noSpeechMs){this.stopped=true;return"no_speech";}
  if(level>=this.threshold){
   this.silenceStartedAt=null;
   if(this.beganSpeaking)return"speech";
   if(this.speechCandidateAt===null)this.speechCandidateAt=now;
   if(now-this.speechCandidateAt>=this.config.minimumSpeechMs){this.beganSpeaking=true;return"speech_started";}
   return"waiting";
  }
  this.speechCandidateAt=null;
  if(!this.beganSpeaking)return"waiting";
  if(this.silenceStartedAt===null)this.silenceStartedAt=now;
  if(now-this.silenceStartedAt>=this.config.silenceMs){this.stopped=true;return"auto_stop";}
  return"silence";
 }
}

export function rootMeanSquare(samples:Float32Array){if(!samples.length)return 0;let sum=0;for(const sample of samples)sum+=sample*sample;return Math.sqrt(sum/samples.length);}
