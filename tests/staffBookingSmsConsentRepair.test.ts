import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('forward repair preserves the original constraint, function body and permission model exactly',()=>{
 const original=read('../supabase/migrations/20260925000500_sms_consent_phone_consistency.sql');
 const repair=read('../supabase/migrations/20260929000200_repair_staff_booking_sms_consent.sql');
 const intended=original.slice(original.indexOf('alter table public.bookings drop constraint')).trim();
 const actual=repair.slice(repair.indexOf('alter table public.bookings drop constraint'),repair.indexOf("notify pgrst,'reload schema';")).trim();
 assert.equal(actual,intended);
 assert.match(repair,/\nbegin;/);assert.match(repair,/notify pgrst,'reload schema';\s+commit;/);
});
