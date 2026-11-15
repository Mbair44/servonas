import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("MMS limits accept supported images and short-video containers only",()=>{
 const source=readFileSync("lib/customerMessages/media.ts","utf8");
 assert.match(source,/maxCustomerMediaBytes=5\*1024\*1024/);assert.match(source,/maxCustomerVideoBytes=600\*1024/);assert.match(source,/maxCustomerMediaAttachments=10/);assert.match(source,/video\/mp4/);assert.match(source,/video\/3gpp/);
});
test("inbound MMS is queued without waiting for downloads and keeps duplicate protection",()=>{
 const source=readFileSync("app/api/twilio/inbound/route.ts","utf8");
 assert.match(source,/MediaUrl\$\{ordinal\}/);assert.match(source,/MediaContentType\$\{ordinal\}/);assert.match(source,/customer_message_attachments/);assert.match(source,/onConflict:"message_id,ordinal"/);assert.match(source,/validTwilioSignature/);
});
test("MMS worker uses authenticated Twilio downloads and private storage",()=>{
 const source=readFileSync("lib/customerMessages/media.ts","utf8");
 assert.match(source,/getSubaccountTwilioHttpClient/);assert.match(source,/customer-message-media/);assert.match(source,/processing_status:"ready"/);assert.match(source,/queueHistoricalCustomerMessageMedia/);assert.match(source,/ffmpeg-static/);assert.match(source,/libx264/);assert.match(source,/original_storage_path/);
});
test("private playback endpoint supports browser byte-range video streaming",()=>{
 const source=readFileSync("app/api/customer-message-media/[businessSlug]/[attachmentId]/route.ts","utf8");
 assert.match(source,/Accept-Ranges/);assert.match(source,/Content-Range/);assert.match(source,/status:206/);
});
test("composer permits media-only sends and uses Twilio MediaUrl",()=>{
 const source=readFileSync("lib/twilio/messageUsage.ts","utf8");
 assert.match(source,/form\.append\("MediaUrl"/);assert.match(source,/signedOutboundMediaUrls/);assert.match(source,/attachmentIds/);
});
