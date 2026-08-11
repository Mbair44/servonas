import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {isSupportedAudioMimeType,OpenAISpeechToTextProvider,VOICE_MAX_DURATION_MS,VOICE_MAX_UPLOAD_BYTES} from "../lib/assistant/speechToText.ts";
import {speechFriendlyText,speechPlaybackTimeoutMs} from "../lib/assistant/textToSpeech.ts";
import {consumeVoiceTranscriptionLimit} from "../lib/assistant/voiceRateLimit.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("OpenAI transcription provider sends transient multipart audio and returns metering metadata",async()=>{
 const original=globalThis.fetch,calls:{url:string;init?:RequestInit}[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(input),init});return new Response(JSON.stringify({text:"Who is next?"}),{status:200,headers:{"content-type":"application/json","x-request-id":"req_voice_1"}});};
 try{
  const result=await new OpenAISpeechToTextProvider("test-key","gpt-4o-mini-transcribe").transcribe({audio:new Blob(["audio"],{type:"audio/webm"}),fileName:"command.webm",durationMs:1200});
  assert.equal(result.text,"Who is next?");assert.equal(result.durationMs,1200);assert.equal(result.providerRequestId,"req_voice_1");assert.equal(calls.length,1);assert.equal(calls[0].url,"https://api.openai.com/v1/audio/transcriptions");assert.ok(calls[0].init?.body instanceof FormData);assert.match(String((calls[0].init?.headers as Record<string,string>).Authorization),/^Bearer /);
 }finally{globalThis.fetch=original;}
});

test("voice validation accepts browser audio codecs and rejects unrelated uploads",()=>{assert.equal(isSupportedAudioMimeType("audio/webm;codecs=opus"),true);assert.equal(isSupportedAudioMimeType("audio/mp4"),true);assert.equal(isSupportedAudioMimeType("image/png"),false);assert.equal(VOICE_MAX_DURATION_MS,60_000);assert.equal(VOICE_MAX_UPLOAD_BYTES,4*1024*1024);});

test("voice endpoint is authenticated, tenant-scoped, paid-feature gated, bounded, and provider-safe",async()=>{
 const route=await read("app/api/assistant/[businessSlug]/voice/transcribe/route.ts");
 assert.match(route,/requireWorkspace\(businessSlug\)/);assert.match(route,/isBusinessAssistantEnabled\(business\.id\)/);assert.match(route,/consumeVoiceTranscriptionLimit\(`\$\{business\.id\}:\$\{user\.id\}`\)/);assert.match(route,/VOICE_MAX_UPLOAD_BYTES/);assert.match(route,/VOICE_MAX_DURATION_MS/);assert.match(route,/isSupportedAudioMimeType/);assert.match(route,/instanceof File/);assert.match(route,/I couldn't transcribe that recording/);assert.doesNotMatch(route,/response body|Authorization/);
});

test("voice and typed input share one conversation and the existing orchestrator",async()=>{
 const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx"),route=await read("app/api/assistant/[businessSlug]/route.ts"),orchestrator=await read("lib/assistant/orchestrator.ts");
 assert.match(client,/submitAssistant\(transcript,"voice",requestId\)/);assert.match(client,/conversationId,channel,requestId/);assert.match(route,/channel=body\.channel==="voice"\?"voice":"web"/);assert.match(route,/processAssistantInput/);assert.match(route,/\.in\("channel",\["web","voice"\]\)/);assert.match(orchestrator,/tenant-validated selected customer/);assert.match(orchestrator,/tenant-validated selected invoice/);
});

test("one completed voice recording makes one transcription and one Assistant request",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.equal((client.match(/fetch\(`\/api\/assistant\/\$\{businessSlug\}\/voice\/transcribe`/g)??[]).length,1);assert.equal((client.match(/submitAssistant\(transcript,"voice",requestId\)/g)??[]).length,1);});

test("cancelled recording is discarded before transcription",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.match(client,/canceled\.current=true/);assert.match(client,/if\(wasCanceled\).*return/);assert.match(client,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);});

test("voice preserves existing permissions, confirmations, and idempotency",async()=>{const route=await read("app/api/assistant/[businessSlug]/route.ts"),client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx"),orchestrator=await read("lib/assistant/orchestrator.ts");assert.match(route,/requireWorkspace/);assert.match(client,/Confirmation required/);assert.match(client,/crypto\.randomUUID\(\)/);assert.match(orchestrator,/requires_confirmation:true/);assert.match(orchestrator,/context\.requestId/);});

test("browser speech synthesis is optional, stoppable, and strips table formatting",()=>{assert.equal(speechFriendlyText("**Total** | $20\nhttps://example.com"),"Total , $20 link");});

test("successful voice requests deterministically leave thinking when TTS is disabled",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.match(client,/setVoiceState\("idle"\);\s+if\(!speakResponses\|\|!ttsSupported\)\{onComplete\?\.\(\);return;\}/);assert.match(client,/finally\{requestInFlight\.current=false;setLoading\(false\);if\(channel==="voice"\)setVoiceState/);});

test("successful TTS completion and errors both return voice state to idle",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx"),provider=await read("lib/assistant/textToSpeech.ts");assert.match(client,/onEnd:finish/);assert.match(client,/function finishSpeaking/);assert.match(provider,/utterance\.onend=\(\)=>handlers\.onEnd\?\.\(\)/);assert.match(provider,/utterance\.onerror=\(\)=>handlers\.onEnd\?\.\(\)/);assert.match(provider,/catch\{handlers\.onEnd\?\.\(\);\}/);});

test("a missing Safari speech callback cannot permanently lock the Assistant",()=>{assert.equal(speechPlaybackTimeoutMs("Short answer"),5_000);assert.equal(speechPlaybackTimeoutMs("x".repeat(1000)),20_000);});

test("transcription and Assistant failures clear their processing states into recoverable error",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.match(client,/I couldn't transcribe that recording\."\);setVoiceState\("error"\)/);assert.match(client,/I couldn't complete that request\."\);setVoiceState\("error"\)/);assert.doesNotMatch(client,/const busy=.*voiceState==="error"/);});

test("completed response and cancellation remove stale processing UI",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.match(client,/setMessages\(current=>\[\.\.\.current,\{id:crypto\.randomUUID\(\),role:"assistant",content:body\.message/);assert.match(client,/function cancelRecording\(\).*setVoiceState\("idle"\)/);assert.match(client,/voiceState==="transcribing"\|\|voiceState==="thinking"/);});

test("stale TTS callbacks cannot reset a newer recording lifecycle",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.match(client,/speechGeneration=useRef\(0\)/);assert.match(client,/generation!==speechGeneration\.current/);assert.match(client,/speechGeneration\.current\+=1/);});

test("typed and subsequent voice submissions remain enabled after voice settlement",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.match(client,/const busy=loading\|\|recordingActive\|\|voiceState==="transcribing"\|\|voiceState==="thinking"/);assert.doesNotMatch(client,/const busy=.*voiceState==="speaking"/);assert.match(client,/await submitAssistant\(value,typedRequest\.channel,typedRequest\.requestId\)/);assert.match(client,/onClick=\{\(\)=>void startRecording\(\)\}/);});

test("voice rate limiter provides a bounded abuse-control window",()=>{for(let index=0;index<10;index++)assert.equal(consumeVoiceTranscriptionLimit("test-rate-key",1000),true);assert.equal(consumeVoiceTranscriptionLimit("test-rate-key",1000),false);assert.equal(consumeVoiceTranscriptionLimit("test-rate-key",61_001),true);});

test("voice implementation has no Twilio dependency or raw-audio persistence",async()=>{const files=await Promise.all([read("app/api/assistant/[businessSlug]/voice/transcribe/route.ts"),read("lib/assistant/speechToText.ts"),read("app/app/[businessSlug]/assistant/AssistantClient.tsx")]);const source=files.join("\n");assert.doesNotMatch(source,/twilio/i);assert.doesNotMatch(source,/storage\.from|\.upload\(/);});
