"use client";
import {FormEvent,useEffect,useMemo,useRef,useState} from "react";
import {BrowserSpeechSynthesisProvider,speechPlaybackTimeoutMs} from "@/lib/assistant/textToSpeech";

type Message={id:string;role:"user"|"assistant";content:string;actionRequest?:{id:string;status:string;summary:string}};
type VoiceState="idle"|"listening"|"transcribing"|"thinking"|"speaking";
const MAX_RECORDING_MS=60_000;
const MIME_PREFERENCES=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg;codecs=opus"];

function MicIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/></svg>;}

export function AssistantClient({businessSlug,initialConversationId,initialMessages,onConversationId}:{businessSlug:string;initialConversationId:string|null;initialMessages:Message[];onConversationId?:(id:string)=>void}){
 const [conversationId,setConversationId]=useState(initialConversationId),[messages,setMessages]=useState(initialMessages),[input,setInput]=useState(""),[loading,setLoading]=useState(false),[error,setError]=useState(""),[voiceState,setVoiceState]=useState<VoiceState>("idle"),[speakResponses,setSpeakResponses]=useState(false),[voiceSupported,setVoiceSupported]=useState(true),[ttsSupported,setTtsSupported]=useState(false);
 const end=useRef<HTMLDivElement>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]),recordingStarted=useRef(0),recordingTimer=useRef<ReturnType<typeof setTimeout>|null>(null),speechTimer=useRef<ReturnType<typeof setTimeout>|null>(null),speechGeneration=useRef(0),canceled=useRef(false);
 const tts=useMemo(()=>new BrowserSpeechSynthesisProvider(),[]),busy=loading||voiceState==="listening"||voiceState==="transcribing"||voiceState==="thinking";
 const scroll=()=>setTimeout(()=>end.current?.scrollIntoView({behavior:"smooth"}),20);

 useEffect(()=>{setVoiceSupported(typeof window!=="undefined"&&typeof MediaRecorder!=="undefined"&&Boolean(navigator.mediaDevices?.getUserMedia));setTtsSupported(tts.supported());setSpeakResponses(localStorage.getItem("servonas-assistant-speak")==="true");return()=>{if(recordingTimer.current)clearTimeout(recordingTimer.current);if(speechTimer.current)clearTimeout(speechTimer.current);if(recorder.current?.state!=="inactive")recorder.current?.stop();stream.current?.getTracks().forEach(track=>track.stop());tts.stop();};},[tts]);

 function finishSpeaking(generation?:number){if(generation!==undefined&&generation!==speechGeneration.current)return;if(speechTimer.current){clearTimeout(speechTimer.current);speechTimer.current=null;}setVoiceState("idle");}
 function speak(message:string){setVoiceState("idle");if(!speakResponses||!ttsSupported)return;const generation=++speechGeneration.current;try{tts.speak(message,{onStart:()=>{if(generation!==speechGeneration.current)return;setVoiceState("speaking");speechTimer.current=setTimeout(()=>{if(generation!==speechGeneration.current)return;tts.stop();finishSpeaking(generation);},speechPlaybackTimeoutMs(message));},onEnd:()=>finishSpeaking(generation)});}catch{finishSpeaking(generation);}}

 async function submitAssistant(value:string,channel:"web"|"voice",requestId:string){
  setLoading(true);if(channel==="voice")setVoiceState("thinking");scroll();
  try{
   const response=await fetch(`/api/assistant/${businessSlug}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({input:value,conversationId,channel,requestId})}),body=await response.json();
   if(!response.ok)throw new Error(body.error||"Assistant request failed.");
   setConversationId(body.conversationId);onConversationId?.(body.conversationId);
   setMessages(current=>[...current,{id:crypto.randomUUID(),role:"assistant",content:body.message,actionRequest:body.actionRequest}]);
   if(channel==="voice")speak(body.message);else setVoiceState("idle");
  }catch(caught){setError(caught instanceof Error?caught.message:"I couldn't complete that request.");setVoiceState("idle");}
  finally{setLoading(false);if(channel==="voice")setVoiceState(current=>current==="speaking"?current:"idle");scroll();}
 }

 async function send(event:FormEvent){event.preventDefault();const value=input.trim();if(!value||busy)return;const requestId=crypto.randomUUID(),typedRequest={channel:"web",requestId} as const;setInput("");setError("");setMessages(current=>[...current,{id:requestId,role:"user",content:value}]);await submitAssistant(value,typedRequest.channel,typedRequest.requestId);}

 function releaseRecorder(){if(recordingTimer.current){clearTimeout(recordingTimer.current);recordingTimer.current=null;}stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;recorder.current=null;}

 async function transcribe(blob:Blob,durationMs:number){
  setVoiceState("transcribing");setError("");
  try{
   const form=new FormData();form.set("audio",blob,"voice-command");form.set("durationMs",String(durationMs));
   const response=await fetch(`/api/assistant/${businessSlug}/voice/transcribe`,{method:"POST",body:form}),body=await response.json();
   if(!response.ok)throw new Error(body.error||"I couldn't transcribe that recording.");
   const transcript=String(body.transcript??"").trim();if(!transcript)throw new Error("I couldn't hear anything. Try again.");
   const requestId=crypto.randomUUID();setMessages(current=>[...current,{id:requestId,role:"user",content:transcript}]);
   await submitAssistant(transcript,"voice",requestId);
  }catch(caught){setError(caught instanceof Error?caught.message:"I couldn't transcribe that recording.");setVoiceState("idle");}
 }

 async function startRecording(){
  if(busy)return;stopSpeaking();setError("");canceled.current=false;chunks.current=[];
  if(typeof MediaRecorder==="undefined"||!navigator.mediaDevices?.getUserMedia){setVoiceSupported(false);setError("Voice recording isn't supported in this browser.");return;}
  try{
   const mediaStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});stream.current=mediaStream;
   const mimeType=MIME_PREFERENCES.find(type=>MediaRecorder.isTypeSupported(type));
   const mediaRecorder=new MediaRecorder(mediaStream,mimeType?{mimeType}:undefined);recorder.current=mediaRecorder;recordingStarted.current=Date.now();
   mediaRecorder.ondataavailable=event=>{if(event.data.size)chunks.current.push(event.data);};
   mediaRecorder.onerror=()=>{releaseRecorder();setVoiceState("idle");setError("Recording was interrupted. Try again.");};
   mediaRecorder.onstop=()=>{const durationMs=Date.now()-recordingStarted.current,type=mediaRecorder.mimeType||chunks.current[0]?.type||"audio/webm",blob=new Blob(chunks.current,{type});releaseRecorder();if(canceled.current)return;if(!blob.size){setVoiceState("idle");setError("I couldn't hear anything. Try again.");return;}void transcribe(blob,durationMs);};
   mediaRecorder.start(250);setVoiceState("listening");recordingTimer.current=setTimeout(()=>{if(mediaRecorder.state==="recording")mediaRecorder.stop();},MAX_RECORDING_MS);
  }catch(caught){releaseRecorder();setVoiceState("idle");const name=caught instanceof DOMException?caught.name:"";setError(name==="NotAllowedError"||name==="SecurityError"?"Microphone permission is blocked. Allow microphone access in your browser settings and try again.":name==="NotFoundError"?"No microphone was found on this device.":"I couldn't start the microphone. Try again.");}
 }

 function stopRecording(){if(recorder.current?.state==="recording")recorder.current.stop();}
 function cancelRecording(){canceled.current=true;if(recorder.current?.state==="recording")recorder.current.stop();else releaseRecorder();setVoiceState("idle");}
 function stopSpeaking(){speechGeneration.current+=1;tts.stop();finishSpeaking();}
 async function decide(messageId:string,actionId:string,decision:"confirm"|"reject"){if(busy)return;setLoading(true);setError("");try{const response=await fetch(`/api/assistant/${businessSlug}/actions/${actionId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision})}),body=await response.json();if(!response.ok)throw new Error(body.error||"Action failed.");setMessages(current=>current.map(message=>message.id===messageId?{...message,actionRequest:message.actionRequest?{...message.actionRequest,status:body.status}:undefined}:message).concat({id:crypto.randomUUID(),role:"assistant",content:body.message}));}catch(caught){setError(caught instanceof Error?caught.message:"I couldn't complete that action.");}finally{setLoading(false);scroll();}}

 const stateLabel=voiceState==="listening"?"Listening…":voiceState==="transcribing"?"Transcribing…":voiceState==="thinking"?"Servonas is thinking…":voiceState==="speaking"?"Speaking…":"Tap to speak";
 return <section className="assistant-card"><div className="assistant-messages" aria-live="polite">{messages.length===0&&<div className="assistant-empty"><strong>What can I help with?</strong><p>Type a message or tap the microphone. Try “Who do I have tomorrow?”</p></div>}{messages.map(message=><article className={`assistant-message ${message.role}`} key={message.id}><span>{message.role==="user"?"You":"Servonas"}</span><p>{message.content}</p>{message.actionRequest&&<div className="assistant-confirmation"><strong>Confirmation required</strong><div><button disabled={busy||message.actionRequest.status!=="awaiting_confirmation"} className="sv-button" onClick={()=>decide(message.id,message.actionRequest!.id,"confirm")}>Confirm</button><button disabled={busy||message.actionRequest.status!=="awaiting_confirmation"} className="sv-button sv-secondary" onClick={()=>decide(message.id,message.actionRequest!.id,"reject")}>Cancel</button></div></div>}</article>)}{(voiceState==="transcribing"||voiceState==="thinking")&&<article className="assistant-message assistant assistant-progress"><span>Servonas</span><p>{stateLabel}</p></article>}<div ref={end}/></div>{error&&<div className="workspace-notice error" role="alert">{error}</div>}<div className="assistant-voice-controls"><div className="assistant-talk-row">{voiceState==="listening"?<><button type="button" className="assistant-talk-button listening" onClick={stopRecording}><span className="assistant-pulse"/><MicIcon/>Stop</button><button type="button" className="sv-button sv-secondary" onClick={cancelRecording}>Cancel</button></>:voiceState==="speaking"?<button type="button" className="assistant-talk-button" onClick={stopSpeaking}><MicIcon/>Stop speaking</button>:<button type="button" className="assistant-talk-button" disabled={busy||!voiceSupported} onClick={startRecording}><MicIcon/>Talk to Servonas</button>}<span className="assistant-voice-state">{stateLabel}</span></div><label className="assistant-speak-toggle"><input type="checkbox" checked={speakResponses} disabled={!tts.supported()} onChange={event=>{const enabled=event.target.checked;setSpeakResponses(enabled);localStorage.setItem("servonas-assistant-speak",String(enabled));if(!enabled)stopSpeaking();}}/> Speak voice responses</label></div><form className="assistant-composer" onSubmit={send}><label><span className="sr-only">Message Servonas Assistant</span><textarea value={input} disabled={busy} onChange={event=>setInput(event.target.value)} maxLength={4000} rows={2} placeholder="Ask about customers, appointments, or invoices…" onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/></label><button className="sv-button" disabled={busy||!input.trim()}>Send</button></form></section>;
}
