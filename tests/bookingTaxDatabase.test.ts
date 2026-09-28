import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=process.env.PGLITE_TEST_ROOT;
test('booking tax migration preserves historical money, freezes snapshots, and closes RPC bypass', {skip:!root},async()=>{
 const {PGlite}=await import(`${root}/dist/index.js`);const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table inventory_items(id int primary key);create table bookings(id int primary key,total_cents int,tax_cents int);create table booking_items(id int primary key);
 insert into bookings values(1,23500,0);
 create function create_public_booking() returns int language sql as 'select 1';
 grant execute on function create_public_booking() to anon,authenticated;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20260928000300_public_booking_tax_snapshots.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select total_cents,tax_cents,tax_snapshot from bookings where id=1')).rows,[{total_cents:23500,tax_cents:0,tax_snapshot:null}]);
 await db.exec(`insert into bookings(id,total_cents,tax_cents,tax_snapshot) values(2,24580,1080,'{"version":1}');insert into booking_items(id,tax_snapshot) values(2,'{"taxCents":1080}');`);
 await assert.rejects(db.exec(`update bookings set tax_snapshot='{}' where id=2`),/cannot be replaced/);
 await assert.rejects(db.exec(`update booking_items set tax_snapshot=null where id=2`),/cannot be replaced/);
 const permissions=(await db.query(`select has_function_privilege('anon','create_public_booking()','execute') as anon,has_function_privilege('authenticated','create_public_booking()','execute') as authenticated,has_function_privilege('service_role','create_public_booking()','execute') as service`)).rows[0];
 assert.deepEqual(permissions,{anon:false,authenticated:false,service:true});
 }finally{await db.close();}
});
