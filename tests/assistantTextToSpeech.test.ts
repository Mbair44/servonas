import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {OpenAISpeechGenerationProvider,SpeechGenerationError,TTS_DEFAULT_MODEL,TTS_DEFAULT_VOICE,TTS_MAX_TEXT_LENGTH} from "../lib/assistant/speechGeneration.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("OpenAI speech generation returns transient MP3 and usage metadata",async()=>{
 const original=globalThis.fetch,calls:{url:string;init?:RequestInit}[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(input),init});return new Response(new Uint8Array([1,2,3]),{status:200,headers:{"content-type":"audio/mpeg","x-request-id":"req_tts_1"}});};
 try{
  const result=await new OpenAISpeechGenerationProvider("test-key","gpt-4o-mini-tts","marin").generate({text:"Your schedule is ready.",requestId:"request_123"});
  assert.equal(result.contentType,"audio/mpeg");assert.equal(result.audio.byteLength,3);assert.equal(result.model,"gpt-4o-mini-tts");assert.equal(result.voice,"marin");assert.equal(result.inputCharacterCount,23);assert.equal(result.providerRequestId,"req_tts_1");
  assert.equal(calls.length,1);assert.equal(calls[0].url,"https://api.openai.com/v1/audio/speech");const payload=JSON.parse(String(calls[0].init?.body));assert.deepEqual(payload,{model:"gpt-4o-mini-tts",voice:"marin",input:"Your schedule is ready.",response_format:"mp3"});assert.match(String((calls[0].init?.headers as Record<string,string>).Authorization),/^Bearer /);
 }finally{globalThis.fetch=original;}
});

test("speech generation provider sanitizes provider failures",async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>new Response("secret provider body",{status:500});try{await assert.rejects(()=>new OpenAISpeechGenerationProvider("test-key").generate({text:"Hello",requestId:"request_123"}),(error:unknown)=>error instanceof SpeechGenerationError&&error.category==="provider_rejected"&&!error.message.includes("secret"));}finally{globalThis.fetch=original;}});
test("TTS defaults and text limit are explicit",()=>{assert.equal(TTS_DEFAULT_MODEL,"gpt-4o-mini-tts");assert.equal(TTS_DEFAULT_VOICE,"marin");assert.equal(TTS_MAX_TEXT_LENGTH,2000);});

test("TTS endpoint is authenticated tenant scoped entitled bounded and rate limited",async()=>{const route=await read("app/api/assistant/[businessSlug]/voice/speak/route.ts");assert.match(route,/requireWorkspace\(businessSlug\)/);assert.match(route,/isBusinessAssistantEnabled\(business\.id\)/);assert.match(route,/consumeVoiceTranscriptionLimit\(`tts:\$\{business\.id\}:\$\{user\.id\}`\)/);assert.match(route,/TTS_MAX_TEXT_LENGTH/);assert.match(route,/requestIdPattern/);assert.match(route,/Cache-Control":"private, no-store/);assert.doesNotMatch(route,/Authorization|console\.(?:log|error)\([^\n]*text/);});
test("TTS endpoint rejects empty oversized and malformed requests before provider generation",async()=>{const route=await read("app/api/assistant/[businessSlug]/voice/speak/route.ts");assert.match(route,/if\(!text\).*status:400/);assert.match(route,/text\.length>TTS_MAX_TEXT_LENGTH.*status:413/);assert.match(route,/!requestIdPattern\.test\(requestId\).*status:400/);});
test("client uses exactly one server TTS request per spoken response",async()=>{const client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx"),provider=await read("lib/assistant/textToSpeech.ts");assert.equal((client.match(/new OpenAITextToSpeechProvider/g)??[]).length,1);assert.equal((provider.match(/fetch\(this\.endpoint/g)??[]).length,1);assert.match(client,/if\(!speakResponses\|\|!ttsSupported\)\{onComplete\?\.\(\);return;\}/);});
test("audio cleanup aborts requests pauses playback and revokes URLs",async()=>{const provider=await read("lib/assistant/textToSpeech.ts"),client=await read("app/app/[businessSlug]/assistant/AssistantClient.tsx");assert.match(provider,/this\.controller\?\.abort\(\)/);assert.match(provider,/this\.audio\.pause\(\)/);assert.match(provider,/URL\.revokeObjectURL/);assert.match(client,/function endVoiceSession\(\).*stopSpeaking\(false\)/);assert.match(client,/Stop speaking/);});
test("server TTS does not alter Assistant routing Twilio or SMS",async()=>{const source=(await Promise.all([read("app/api/assistant/[businessSlug]/voice/speak/route.ts"),read("lib/assistant/speechGeneration.ts"),read("lib/assistant/textToSpeech.ts")])).join("\n");assert.doesNotMatch(source,/twilio|sms|processAssistantInput|resolveAssistantAction/i);});
