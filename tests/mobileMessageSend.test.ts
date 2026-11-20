import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root=new URL("..",import.meta.url);
const source=(path:string)=>readFile(new URL(path,root),"utf8");

test("mobile message send delegates to the existing durable server sender",async()=>{
 const route=await source("app/api/v1/mobile/businesses/[businessId]/conversations/[conversationKey]/messages/route.ts");
 assert.match(route,/createMobileAuthorizationContext/);
 assert.match(route,/requireMobileMessagingWorkspace/);
 assert.match(route,/replyToConversation/);
 assert.match(route,/sendTenantTwilioMessage/);
 assert.match(route,/messageSid/);
 assert.doesNotMatch(route,/accountSid|authToken/i);
});

test("mobile upload and read routes retain server-side office authorization",async()=>{
 const upload=await source("app/api/v1/mobile/businesses/[businessId]/conversation-attachments/route.ts");
 const read=await source("app/api/v1/mobile/businesses/[businessId]/conversations/[conversationKey]/read/route.ts");
 assert.match(upload,/requireMobileMessagingWorkspace/);
 assert.match(upload,/allowedCustomerMedia/);
 assert.match(upload,/createSignedUploadUrl/);
 assert.match(read,/requireMobileMessagingWorkspace/);
 assert.match(read,/markConversationRead/);
});

test("native composer retains the logical request id for a failed send",async()=>{
 const screen=await source("apps/mobile/app/(office)/messages/[businessId].tsx");
 assert.match(screen,/requestId\?\?Crypto\.randomUUID\(\)/);
 assert.match(screen,/setRequestId\(undefined\)/);
 assert.match(screen,/uploadToSignedUrl/);
 assert.match(screen,/requestCameraPermissionsAsync/);
 assert.match(screen,/requestMediaLibraryPermissionsAsync/);
});
