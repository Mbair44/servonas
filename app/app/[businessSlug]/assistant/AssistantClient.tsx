"use client";
import {FormEvent,useEffect,useMemo,useRef,useState} from "react";
import {BrowserSpeechSynthesisProvider,speechPlaybackTimeoutMs} from "@/lib/assistant/textToSpeech";
import {rootMeanSquare,VoiceActivityTracker} from "@/lib/assistant/voiceActivity";

type Message={id:string;role:"user"|"assistant";content:string;actionRequest?:{id:string;status:string;summary:string}};
type VoiceState="idle"|"waiting_for_speech"|"listening"|"finishing"|"transcribing"|"thinking"|"speaking"|"waiting_for_next_command"|"error";
const MAX_RECORDING_MS=60_000;
const NEXT_COMMAND_DELAY_MS=650;
const MIME_PREFERENCES=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg;codecs=opus"];
const voiceDebug=(event:string,details:Record<string,unknown>)=>{if(process.env.NODE_ENV!=="production"||process.env.NEXT_PUBLIC_ASSISTANT_VOICE_DEBUG==="true")console.debug("Assistant voice lifecycle",{event,...details});};

function MicIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/></svg>;}

export function AssistantClient({businessSlug,initialConversationId,initialMessages,onConversationId}:{businessSlug:string;initialConversationId:string|null;initialMessages:Message[];onConversationId?:(id:string)=>void}){
 const [conversationId,setConversationId]=useState(initialConversationId);
 const [messages,setMessages]=useState(initialMessages);
 const [input,setInput]=useState("");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [voiceState,setVoiceState]=useState<VoiceState>("idle");
 const [speakResponses,setSpeakResponses]=useState(false);
 const [voiceSupported,setVoiceSupported]=useState(true);
 const [ttsSupported,setTtsSupported]=useState(false);
 const [sessionActive,setSessionActive]=useState(false);
 const end=useRef<HTMLDivElement>(null);
 const recorder=useRef<MediaRecorder|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const chunks=useRef<Blob[]>([]);
 const recordingStarted=useRef(0);
 const recordingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const speechTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const resumeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const resumeGeneration=useRef(0);
 const speechGeneration=useRef(0);
 const recordingGeneration=useRef(0);
 const sessionActiveRef=useRef(false);
 const voiceStateRef=useRef<VoiceState>("idle");
 const requestInFlight=useRef(false);
 const canceled=useRef(false);
 const transcriptionAbort=useRef<AbortController|null>(null);
 const audioContext=useRef<AudioContext|null>(null);
 const analyser=useRef<AnalyserNode|null>(null);
 const audioSource=useRef<MediaStreamAudioSourceNode|null>(null);
 const activityFrame=useRef<number|null>(null);
 const activityTracker=useRef<VoiceActivityTracker|null>(null);
 const tts=useMemo(()=>new BrowserSpeechSynthesisProvider(),[]);
 const recordingActive=voiceState==="waiting_for_speech"||voiceState==="listening"||voiceState==="finishing";
 const busy=loading||recordingActive||voiceState==="transcribing"||voiceState==="thinking"||voiceState==="waiting_for_next_command";
 const scroll=()=>setTimeout(()=>end.current?.scrollIntoView({behavior:"smooth"}),20);

 useEffect(()=>{
  setVoiceSupported(typeof window!=="undefined"&&typeof MediaRecorder!=="undefined"&&Boolean(navigator.mediaDevices?.getUserMedia));
  setTtsSupported(tts.supported());
  setSpeakResponses(localStorage.getItem("servonas-assistant-speak")==="true");
  return()=>{
   sessionActiveRef.current=false;
   recordingGeneration.current+=1;
   if(recordingTimer.current)clearTimeout(recordingTimer.current);
   if(speechTimer.current)clearTimeout(speechTimer.current);
   if(resumeTimer.current)clearTimeout(resumeTimer.current);
   if(activityFrame.current!==null)cancelAnimationFrame(activityFrame.current);
   transcriptionAbort.current?.abort();
   if(recorder.current?.state!=="inactive")recorder.current?.stop();
   stream.current?.getTracks().forEach(track=>track.stop());
   audioSource.current?.disconnect();analyser.current?.disconnect();void audioContext.current?.close();
   tts.stop();
  };
 },[tts]);
 useEffect(()=>{voiceStateRef.current=voiceState;},[voiceState]);

 function diagnostic(event:string,details:Record<string,unknown>={}){voiceDebug(event,{voiceState:voiceStateRef.current,conversationSessionActive:sessionActiveRef.current,...details});}
 function clearResumeTimer(invalidate=true){if(invalidate)resumeGeneration.current+=1;if(resumeTimer.current){clearTimeout(resumeTimer.current);resumeTimer.current=null;}}
 function cleanupVoiceActivity(preserveContext=false){if(activityFrame.current!==null){cancelAnimationFrame(activityFrame.current);activityFrame.current=null;}audioSource.current?.disconnect();audioSource.current=null;analyser.current?.disconnect();analyser.current=null;if(audioContext.current&&!preserveContext){void audioContext.current.close();audioContext.current=null;}activityTracker.current=null;}
 function stopMicrophoneStream(){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;}
 function releaseRecorder(preserveSessionMedia=false){if(recordingTimer.current){clearTimeout(recordingTimer.current);recordingTimer.current=null;}cleanupVoiceActivity(preserveSessionMedia);if(!preserveSessionMedia)stopMicrophoneStream();recorder.current=null;}
 function releaseConversationMedia(){cleanupVoiceActivity(false);stopMicrophoneStream();}
 function finishSpeaking(generation?:number,onComplete?:()=>void){if(generation!==undefined&&generation!==speechGeneration.current)return;if(generation!==undefined)speechGeneration.current+=1;if(speechTimer.current){clearTimeout(speechTimer.current);speechTimer.current=null;}setVoiceState("idle");onComplete?.();}
 function stopSpeaking(resumeSession=false){speechGeneration.current+=1;tts.stop();finishSpeaking();if(resumeSession&&sessionActiveRef.current)scheduleNextCommand();}
 function speak(message:string,onComplete?:()=>void){
  setVoiceState("idle");
  if(!speakResponses||!ttsSupported){onComplete?.();return;}
  const generation=++speechGeneration.current;
  const finish=()=>finishSpeaking(generation,onComplete);
  setVoiceState("speaking");
  speechTimer.current=setTimeout(()=>{if(generation!==speechGeneration.current)return;tts.stop();finish();},speechPlaybackTimeoutMs(message));
  try{tts.speak(message,{onStart:()=>{if(generation!==speechGeneration.current)return;setVoiceState("speaking");},onEnd:finish});}catch{finish();}
 }
 function scheduleNextCommand(){
  clearResumeTimer();
  if(!sessionActiveRef.current)return;
  const generation=resumeGeneration.current;
  setVoiceState("waiting_for_next_command");
  diagnostic("resume_timer_scheduled",{delayMs:NEXT_COMMAND_DELAY_MS,generation});
  resumeTimer.current=setTimeout(()=>{resumeTimer.current=null;void attemptConversationRestart(generation,0);},NEXT_COMMAND_DELAY_MS);
 }
 async function attemptConversationRestart(generation:number,attempt:number){
  diagnostic("resume_timer_fired",{generation,attempt});
  if(generation!==resumeGeneration.current||!sessionActiveRef.current){diagnostic("microphone_restart_skipped",{reason:"session_or_generation_changed",generation,attempt});return;}
  if(requestInFlight.current){if(attempt<3)resumeTimer.current=setTimeout(()=>{resumeTimer.current=null;void attemptConversationRestart(generation,attempt+1);},150);return;}
  if(recorder.current&&recorder.current.state!=="inactive"){diagnostic("microphone_restart_deferred",{reason:"stale_recorder_active",recorderState:recorder.current.state,attempt});if(attempt<3)resumeTimer.current=setTimeout(()=>{resumeTimer.current=null;void attemptConversationRestart(generation,attempt+1);},150);return;}
  if(recorder.current?.state==="inactive")recorder.current=null;
  diagnostic("microphone_restart_attempted",{attempt,reusingLiveStream:Boolean(stream.current?.getAudioTracks().some(track=>track.readyState==="live"))});
  const restarted=await startRecording(true);diagnostic(restarted?"microphone_restart_succeeded":"microphone_restart_failed",{attempt});
 }

 async function submitAssistant(value:string,channel:"web"|"voice",requestId:string){
  const voiceSessionRequest=channel==="voice"&&sessionActiveRef.current;
  requestInFlight.current=true;setLoading(true);if(channel==="voice")setVoiceState("thinking");scroll();
  try{
   const response=await fetch(`/api/assistant/${businessSlug}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({input:value,conversationId,channel,requestId})}),body=await response.json();
   if(!response.ok)throw new Error(body.error||"Assistant request failed.");
   setConversationId(body.conversationId);onConversationId?.(body.conversationId);
   setMessages(current=>[...current,{id:crypto.randomUUID(),role:"assistant",content:body.message,actionRequest:body.actionRequest}]);
   if(channel==="voice"){
    if(voiceSessionRequest&&!sessionActiveRef.current)setVoiceState("idle");
    else{const continueSession=sessionActiveRef.current&&!body.actionRequest;if(body.actionRequest)releaseConversationMedia();speak(body.message,continueSession?scheduleNextCommand:undefined);}
   }else setVoiceState("idle");
  }catch(caught){releaseConversationMedia();setError(caught instanceof Error?caught.message:"I couldn't complete that request.");setVoiceState("error");}
  finally{requestInFlight.current=false;setLoading(false);if(channel==="voice")setVoiceState(current=>current==="speaking"||current==="waiting_for_next_command"||current==="error"?current:"idle");scroll();}
 }

 async function send(event:FormEvent){event.preventDefault();const value=input.trim();if(!value||busy)return;const requestId=crypto.randomUUID(),typedRequest={channel:"web",requestId} as const;setInput("");setError("");setMessages(current=>[...current,{id:requestId,role:"user",content:value}]);await submitAssistant(value,typedRequest.channel,typedRequest.requestId);}

 async function transcribe(blob:Blob,durationMs:number){
  setVoiceState("transcribing");setError("");
  const controller=new AbortController();transcriptionAbort.current=controller;
  try{
   const form=new FormData();form.set("audio",blob,"voice-command");form.set("durationMs",String(durationMs));
   const response=await fetch(`/api/assistant/${businessSlug}/voice/transcribe`,{method:"POST",body:form,signal:controller.signal}),body=await response.json();
   if(!response.ok)throw new Error(body.error||"I couldn't transcribe that recording.");
   const transcript=String(body.transcript??"").trim();if(!transcript)throw new Error("I couldn't hear anything. Try again.");
   const requestId=crypto.randomUUID();setMessages(current=>[...current,{id:requestId,role:"user",content:transcript}]);
   await submitAssistant(transcript,"voice",requestId);
  }catch(caught){releaseConversationMedia();if(caught instanceof DOMException&&caught.name==="AbortError")setVoiceState("idle");else{setError(caught instanceof Error?caught.message:"I couldn't transcribe that recording.");setVoiceState("error");}}
  finally{if(transcriptionAbort.current===controller)transcriptionAbort.current=null;}
 }

 function stopWithoutSubmission(message:string){canceled.current=true;setError(message);setVoiceState("error");if(recorder.current?.state==="recording")recorder.current.stop();else releaseRecorder(false);}
 function stopRecording(){if(recorder.current?.state==="recording"){setVoiceState("finishing");recorder.current.stop();}}
 function cancelRecording(){clearResumeTimer();canceled.current=true;if(recorder.current?.state==="recording")recorder.current.stop();else releaseRecorder(false);setVoiceState("idle");diagnostic("recording_canceled",{automaticRestart:false});}

 function beginVoiceActivity(mediaStream:MediaStream){
  const AudioContextConstructor=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!AudioContextConstructor)return;
  try{
   const context=audioContext.current&&audioContext.current.state!=="closed"?audioContext.current:new AudioContextConstructor();audioContext.current=context;if(context.state==="suspended")void context.resume();
   const source=context.createMediaStreamSource(mediaStream),levelAnalyser=context.createAnalyser();source.connect(levelAnalyser);levelAnalyser.fftSize=1024;audioSource.current=source;analyser.current=levelAnalyser;
   const tracker=new VoiceActivityTracker(performance.now());activityTracker.current=tracker;
   const samples=new Float32Array(levelAnalyser.fftSize);
   const monitor=()=>{
    if(!recorder.current||recorder.current.state!=="recording")return;
    levelAnalyser.getFloatTimeDomainData(samples);const event=tracker.sample(rootMeanSquare(samples),performance.now());
    if(event==="speech_started"||event==="speech")setVoiceState("listening");
    if(event==="auto_stop"){setVoiceState("finishing");recorder.current.stop();return;}
    if(event==="no_speech"){stopWithoutSubmission("I didn't hear anything. Try again.");return;}
    activityFrame.current=requestAnimationFrame(monitor);
   };
   activityFrame.current=requestAnimationFrame(monitor);
  }catch{cleanupVoiceActivity();}
 }

 async function startRecording(fromConversationResume=false){
  diagnostic(fromConversationResume?"microphone_restart_attempt_entered":"microphone_start_attempted",{fromConversationResume});
  if(requestInFlight.current||recorder.current?.state==="recording"){diagnostic("microphone_start_blocked",{requestInFlight:requestInFlight.current,recorderState:recorder.current?.state??null});return false;}
  const generation=++recordingGeneration.current;
  clearResumeTimer(!fromConversationResume);stopSpeaking(false);setError("");canceled.current=false;chunks.current=[];
  if(typeof MediaRecorder==="undefined"||!navigator.mediaDevices?.getUserMedia){setVoiceSupported(false);setError("Voice recording isn't supported in this browser.");setVoiceState("error");diagnostic("microphone_start_failed",{reason:"unsupported"});return false;}
  try{
   const reusableStream=sessionActiveRef.current&&stream.current?.getAudioTracks().some(track=>track.readyState==="live")?stream.current:null;
   const mediaStream=reusableStream??await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});if(generation!==recordingGeneration.current){if(!reusableStream)mediaStream.getTracks().forEach(track=>track.stop());return false;}stream.current=mediaStream;
   if(!sessionActiveRef.current&&sessionActive)setSessionActive(false);
   const mimeType=MIME_PREFERENCES.find(type=>MediaRecorder.isTypeSupported(type));
   const mediaRecorder=new MediaRecorder(mediaStream,mimeType?{mimeType}:undefined);recorder.current=mediaRecorder;recordingStarted.current=Date.now();
   mediaRecorder.ondataavailable=event=>{if(event.data.size)chunks.current.push(event.data);};
   mediaRecorder.onerror=()=>{canceled.current=true;releaseRecorder(false);setVoiceState("error");setError("Recording was interrupted. Try again.");diagnostic("microphone_recording_failed",{reason:"media_recorder_error"});};
   mediaRecorder.onstop=()=>{const durationMs=Date.now()-recordingStarted.current,type=mediaRecorder.mimeType||chunks.current[0]?.type||"audio/webm",blob=new Blob(chunks.current,{type}),wasCanceled=canceled.current,preserveSessionMedia=sessionActiveRef.current&&!wasCanceled;releaseRecorder(preserveSessionMedia);if(wasCanceled){setVoiceState("idle");return;}if(!blob.size){releaseConversationMedia();setVoiceState("error");setError("I couldn't hear anything. Try again.");return;}void transcribe(blob,durationMs);};
   mediaRecorder.start(250);setVoiceState("waiting_for_speech");beginVoiceActivity(mediaStream);
   recordingTimer.current=setTimeout(()=>{if(mediaRecorder.state!=="recording")return;if(activityTracker.current&&!activityTracker.current.hasSpeech())stopWithoutSubmission("I didn't hear anything. Try again.");else{setVoiceState("finishing");mediaRecorder.stop();}},MAX_RECORDING_MS);
   diagnostic("microphone_start_succeeded",{fromConversationResume,reusedStream:Boolean(reusableStream)});return true;
  }catch(caught){releaseRecorder(false);setVoiceState("error");const name=caught instanceof DOMException?caught.name:"";setError(name==="NotAllowedError"||name==="SecurityError"?"Microphone permission is blocked. Allow microphone access in your browser settings and try again.":name==="NotFoundError"?"No microphone was found on this device.":"I couldn't start the microphone. Try again.");diagnostic("microphone_start_failed",{fromConversationResume,errorName:name||(caught instanceof Error?caught.name:"unknown")});return false;}
 }

 function startVoiceSession(){if(sessionActiveRef.current||requestInFlight.current)return;sessionActiveRef.current=true;setSessionActive(true);diagnostic("conversation_session_started");void startRecording();}
 function endVoiceSession(){sessionActiveRef.current=false;recordingGeneration.current+=1;setSessionActive(false);clearResumeTimer();canceled.current=true;transcriptionAbort.current?.abort();transcriptionAbort.current=null;if(recorder.current?.state==="recording")recorder.current.stop();releaseRecorder(false);stopSpeaking(false);setVoiceState("idle");diagnostic("conversation_session_ended");}

 async function decide(messageId:string,actionId:string,decision:"confirm"|"reject"){
  if(busy)return;setLoading(true);setError("");
  try{const response=await fetch(`/api/assistant/${businessSlug}/actions/${actionId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision})}),body=await response.json();if(!response.ok)throw new Error(body.error||"Action failed.");setMessages(current=>current.map(message=>message.id===messageId?{...message,actionRequest:message.actionRequest?{...message.actionRequest,status:body.status}:undefined}:message).concat({id:crypto.randomUUID(),role:"assistant",content:body.message}));if(sessionActiveRef.current)speak(body.message,scheduleNextCommand);}
  catch(caught){setError(caught instanceof Error?caught.message:"I couldn't complete that action.");setVoiceState("error");}
  finally{setLoading(false);scroll();}
 }

 const stateLabel=voiceState==="waiting_for_speech"?"Listening for you…":voiceState==="listening"?"Listening…":voiceState==="finishing"?"Got it…":voiceState==="transcribing"?"Transcribing…":voiceState==="thinking"?"Servonas is thinking…":voiceState==="speaking"?"Speaking…":voiceState==="waiting_for_next_command"?"Listening again shortly…":voiceState==="error"?"Voice paused":"Tap to speak";
 const processing=voiceState==="finishing"||voiceState==="transcribing"||voiceState==="thinking";
 return <section className="assistant-card">
  <div className="assistant-messages" aria-live="polite">
   {messages.length===0&&<div className="assistant-empty"><strong>What can I help with?</strong><p>Type a message or tap the microphone. Try “Who do I have tomorrow?”</p></div>}
   {messages.map(message=><article className={`assistant-message ${message.role}`} key={message.id}><span>{message.role==="user"?"You":"Servonas"}</span><p>{message.content}</p>{message.actionRequest&&<div className="assistant-confirmation"><strong>Confirmation required</strong><div><button disabled={busy||message.actionRequest.status!=="awaiting_confirmation"} className="sv-button" onClick={()=>decide(message.id,message.actionRequest!.id,"confirm")}>Confirm</button><button disabled={busy||message.actionRequest.status!=="awaiting_confirmation"} className="sv-button sv-secondary" onClick={()=>decide(message.id,message.actionRequest!.id,"reject")}>Cancel</button></div></div>}</article>)}
   {processing&&<article className="assistant-message assistant assistant-progress"><span>Servonas</span><p>{stateLabel}</p></article>}<div ref={end}/>
  </div>
  {error&&<div className="workspace-notice error" role="alert">{error}</div>}
  <div className="assistant-voice-controls">
   <div className="assistant-talk-row">
    {recordingActive?<><button type="button" className="assistant-talk-button listening" disabled={voiceState==="finishing"} onClick={stopRecording}><span className="assistant-pulse"/><MicIcon/>Stop</button><button type="button" className="sv-button sv-secondary" disabled={voiceState==="finishing"} onClick={cancelRecording}>Cancel</button></>:voiceState==="speaking"?<button type="button" className="assistant-talk-button" onClick={()=>stopSpeaking(true)}><MicIcon/>Stop speaking</button>:<button type="button" className="assistant-talk-button" disabled={busy||!voiceSupported} onClick={()=>void startRecording()}><MicIcon/>{sessionActive?"Resume listening":"Talk to Servonas"}</button>}
    <span className="assistant-voice-state">{stateLabel}</span>
   </div>
   <div className="assistant-session-controls">{sessionActive?<><strong>Voice session active</strong><button type="button" className="text-button" onClick={endVoiceSession}>End session</button></>:<button type="button" className="text-button" disabled={busy||!voiceSupported} onClick={startVoiceSession}>Start voice session</button>}</div>
   <label className="assistant-speak-toggle"><input type="checkbox" checked={speakResponses} disabled={!ttsSupported} onChange={event=>{const enabled=event.target.checked;setSpeakResponses(enabled);localStorage.setItem("servonas-assistant-speak",String(enabled));if(!enabled)stopSpeaking(sessionActiveRef.current);}}/> Speak voice responses</label>
  </div>
  <form className="assistant-composer" onSubmit={send}><label><span className="sr-only">Message Servonas Assistant</span><textarea value={input} disabled={busy} onChange={event=>setInput(event.target.value)} maxLength={4000} rows={2} placeholder="Ask about customers, appointments, or invoices…" onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/></label><button className="sv-button" disabled={busy||!input.trim()}>Send</button></form>
 </section>;
}
